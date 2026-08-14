// Konfigurasi Supabase
window.SUPABASE_URL = "https://yatmsttajhpdzmhcqyup.supabase.co";
  window.SUPABASE_ANON_KEY = "sb_publishable_S2BYuyE3pHyE7bLPCYJ0aQ_gVL0fdW9";

  // VAPID PUBLIC key saja (AMAN di frontend). Private key HANYA di Supabase Edge Function secrets.
  // Generate: npx web-push generate-vapid-keys
  // Lalu tempel public key di sini + set private di Supabase secrets.
  window.VAPID_PUBLIC_KEY = "BPLsXSc6wb3OYkjINnPwWqzfTOMpGPHSzXHLjnodu-kc6xahpopZOe4iHuSsPCxO8sOAGXk8eiZPFF16sySELBk";

// ==========================================================================
  // Koneksi ke Supabase (database + storage foto/video bersama).
  // ==========================================================================
  const sb = (window.SUPABASE_URL && window.SUPABASE_URL !== "GANTI_DENGAN_SUPABASE_PROJECT_URL")
    ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function needsSupabaseSetup(){
    if(!sb){
      alert('Supabase belum disambungkan. Buka SETUP.md yang dikirim bareng file ini, terus isi SUPABASE_URL & SUPABASE_ANON_KEY di bagian <head> file HTML.');
      return true;
    }
    return false;
  }

  // ---------- safe storage (localStorage = tetap login seperti app sosmed) ----------
  // Login disimpan permanen di device sampai user klik Logout / clear data browser.
  // Cocok untuk grup kecil (6 orang) yang sering buka-buka lagi.
  const _memStore = {};
  const safeStorage = {
    get(key){
      try{ return localStorage.getItem(key); }catch(e){ return _memStore[key] || null; }
    },
    set(key, val){
      try{ localStorage.setItem(key, val); }catch(e){ _memStore[key] = val; }
    },
    remove(key){
      try{ localStorage.removeItem(key); }catch(e){ delete _memStore[key]; }
    }
  };

  // ---------- daftar anggota (username tetap nama; password dibuat sendiri) ----------
  // biodata masing-masing (foto, julukan, ultah, hobi, quote) diisi sendiri oleh tiap anggota
  // pas pertama kali mereka login -> set password + biodata, tersimpan di Supabase
  const MEMBERS = [
    { name: "Saira",   color: "#8fa888" },
    { name: "April",   color: "#c98a91" },
    { name: "Putri",   color: "#d9a373" },
    { name: "Lala",    color: "#a98cb0" },
    { name: "Fauziah", color: "#c9a34e" },
    { name: "Neva",    color: "#6f9b8a" }
  ];

  const userInput = document.getElementById('userInput');
  const pwInput   = document.getElementById('pwInput');
  const pwConfirmInput = document.getElementById('pwConfirmInput');
  const pwConfirmWrap  = document.getElementById('pwConfirmWrap');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorMsg  = document.getElementById('errorMsg');
  const lockCard  = document.getElementById('lockCard');
  const lockScreen = document.getElementById('lockScreen');
  const dashboard   = document.getElementById('dashboard');


  // ==========================================================================
  // Web Push Notifications (aman: private key tidak pernah di browser)
  // ==========================================================================
  const ALLOWED_MEMBERS = MEMBERS.map(m => m.name);

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function notifSupported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  async function registerServiceWorker() {
    if (!notifSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return reg;
    } catch (err) {
      console.warn('SW register gagal', err);
      return null;
    }
  }

  async function savePushSubscription(userName, subscription) {
    if (!sb || !subscription) return false;
    if (!ALLOWED_MEMBERS.includes(userName)) return false;

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys && json.keys.p256dh;
    const auth = json.keys && json.keys.auth;
    if (!endpoint || !p256dh || !auth) return false;

    // Upsert by endpoint (unique)
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        user_name: userName,
        endpoint,
        p256dh,
        auth,
        user_agent: (navigator.userAgent || '').slice(0, 240)
      },
      { onConflict: 'endpoint' }
    );
    if (error) {
      console.warn('Gagal simpan subscription', error);
      return false;
    }
    try { localStorage.setItem('sapulapojne_push_ok', '1'); } catch (_) {}
    return true;
  }

  async function removePushSubscription(subscription) {
    if (!sb || !subscription) return;
    try {
      const endpoint = subscription.endpoint || (subscription.toJSON && subscription.toJSON().endpoint);
      if (endpoint) {
        await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
      await subscription.unsubscribe();
    } catch (e) {
      console.warn('unsubscribe error', e);
    }
    try { localStorage.removeItem('sapulapojne_push_ok'); } catch (_) {}
  }

  async function enablePushNotifications(userName) {
    if (!notifSupported()) {
      alert('Browser kamu belum mendukung notifikasi push. Coba Chrome/Edge/Firefox di Android, atau Safari setelah "Add to Home Screen" di iPhone.');
      return false;
    }
    if (!window.VAPID_PUBLIC_KEY || window.VAPID_PUBLIC_KEY.startsWith('GANTI_')) {
      alert('VAPID public key belum diisi. Lihat SETUP_NOTIF.md dulu ya.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Izin notifikasi ditolak. Kalau berubah pikiran, aktifkan dari pengaturan browser/situs.');
      return false;
    }

    const reg = await registerServiceWorker();
    if (!reg) {
      alert('Gagal mendaftarkan service worker.');
      return false;
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
      });
    }

    const ok = await savePushSubscription(userName, sub);
    if (!ok) {
      alert('Gagal menyimpan subscription. Coba lagi nanti.');
      return false;
    }
    return true;
  }

  function hideNotifBanner() {
    const el = document.getElementById('notifBanner');
    if (el) el.classList.remove('show');
  }

  function showNotifBanner() {
    const el = document.getElementById('notifBanner');
    if (el) el.classList.add('show');
  }

  function shouldPromptNotif() {
    if (!notifSupported()) return false;
    if (Notification.permission === 'granted') {
      // sudah izinkan — pastikan subscription masih tersimpan
      return false;
    }
    if (Notification.permission === 'denied') return false;
    try {
      if (localStorage.getItem('sapulapojne_push_dismiss') === '1') return false;
    } catch (_) {}
    return true;
  }

  async function ensurePushAfterLogin(userName) {
    if (!notifSupported()) return;

    // Daftarkan SW diam-diam (butuh untuk receive push)
    const reg = await registerServiceWorker();

    if (Notification.permission === 'granted' && reg) {
      // Re-sync subscription ke server (device bisa ganti endpoint)
      try {
        let sub = await reg.pushManager.getSubscription();
        if (!sub && window.VAPID_PUBLIC_KEY && !window.VAPID_PUBLIC_KEY.startsWith('GANTI_')) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
          });
        }
        if (sub) await savePushSubscription(userName, sub);
      } catch (e) {
        console.warn('resync push failed', e);
      }
      return;
    }

    if (shouldPromptNotif()) {
      // tampilkan banner setelah sedikit delay biar dashboard keburu render
      setTimeout(showNotifBanner, 900);
    }
  }

  function setupNotifBannerHandlers() {
    const enableBtn = document.getElementById('notifEnableBtn');
    const laterBtn = document.getElementById('notifLaterBtn');
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        const user = safeStorage.get('sapulapojne_user');
        if (!user) return;
        enableBtn.disabled = true;
        enableBtn.textContent = '...';
        const ok = await enablePushNotifications(user);
        enableBtn.disabled = false;
        enableBtn.textContent = 'Aktifkan';
        if (ok) {
          hideNotifBanner();
          enableBtn.textContent = 'Aktif ✓';
        }
      });
    }
    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        try { localStorage.setItem('sapulapojne_push_dismiss', '1'); } catch (_) {}
        hideNotifBanner();
      });
    }
  }


  // ---------- password hashing (Web Crypto PBKDF2) — plain password TIDAK disimpan ----------
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }
  async function hashPassword(password, saltB64) {
    const enc = new TextEncoder();
    const salt = b64ToBuf(saltB64);
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return bufToB64(bits);
  }
  function randomSaltB64() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return bufToB64(salt);
  }

  async function getAuthRow(name) {
    // Ambil hanya kolom auth; kalau kolom belum ada di DB, error ditangani caller
    const { data, error } = await sb
      .from('profiles')
      .select('name, password_hash, password_salt')
      .eq('name', name)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function savePassword(name, password) {
    const salt = randomSaltB64();
    const hash = await hashPassword(password, salt);
    // upsert name + hash; jangan timpa biodata lain kalau sudah ada
    const existing = await getProfile(name);
    const row = {
      name,
      password_hash: hash,
      password_salt: salt
    };
    if (!existing) {
      // baris baru minimal
      row.nama_lengkap = name;
    }
    const { error } = await sb.from('profiles').upsert(row, { onConflict: 'name' });
    if (error) throw error;
  }

  function shakeLock(msg) {
    errorMsg.textContent = msg;
    lockCard.classList.remove('shake');
    void lockCard.offsetWidth;
    lockCard.classList.add('shake');
  }

  // Cek apakah username sudah punya password → tampilkan/hide confirm field
  async function refreshPasswordMode() {
    if (!pwConfirmWrap) return;
    const name = (userInput && userInput.value) || '';
    if (!name || !sb) {
      pwConfirmWrap.hidden = true;
      return;
    }
    try {
      const row = await getAuthRow(name);
      const hasPw = !!(row && row.password_hash && row.password_salt);
      pwConfirmWrap.hidden = hasPw;
      if (hasPw && pwConfirmInput) pwConfirmInput.value = '';
    } catch (e) {
      // Kalau kolom password belum ada di DB, anggap belum set
      pwConfirmWrap.hidden = false;
      console.warn('auth check', e);
    }
  }
  if (userInput) {
    userInput.addEventListener('change', refreshPasswordMode);
  }

  async function tryUnlock(){
    if(needsSupabaseSetup()) return;
    const name = (userInput && userInput.value) ? userInput.value.trim() : '';
    const password = (pwInput.value || '').trim();
    const confirm = pwConfirmInput ? (pwConfirmInput.value || '').trim() : '';

    if (!name) {
      shakeLock('Pilih nama dulu ya.');
      return;
    }
    const match = MEMBERS.find(m => m.name === name);
    if (!match) {
      shakeLock('Nama ini bukan anggota sapulapojne.');
      return;
    }
    if (!password || password.length < 4) {
      shakeLock('Password minimal 4 karakter ya.');
      return;
    }

    unlockBtn.disabled = true;
    const prevLabel = unlockBtn.textContent;
    unlockBtn.textContent = 'Sebentar...';
    errorMsg.textContent = '';

    try {
      let row = null;
      try {
        row = await getAuthRow(name);
      } catch (e) {
        console.error(e);
        shakeLock('Gagal cek akun. Pastikan kolom password sudah ditambah di Supabase (lihat SETUP_AUTH.md).');
        return;
      }

      const hasPw = !!(row && row.password_hash && row.password_salt);

      if (!hasPw) {
        // Registrasi password pertama kali untuk nama ini
        if (pwConfirmWrap) pwConfirmWrap.hidden = false;
        if (!confirm) {
          shakeLock('Pertama kali masuk: isi password + ulangi password.');
          return;
        }
        if (password !== confirm) {
          shakeLock('Password dan ulangan tidak sama.');
          return;
        }
        await savePassword(name, password);
        enterDashboard(name);
        return;
      }

      // Login biasa
      const hash = await hashPassword(password, row.password_salt);
      if (hash !== row.password_hash) {
        shakeLock('Password salah. Coba lagi ya ✨');
        return;
      }
      enterDashboard(name);
    } catch (err) {
      console.error(err);
      shakeLock('Gagal masuk. Coba lagi.');
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = prevLabel;
    }
  }

  async function enterDashboard(name){
    safeStorage.set('sapulapojne_user', name);
    lockScreen.classList.add('hide');
    dashboard.classList.add('show');
    document.getElementById('whoName').textContent = name;
    showMusicBar();
    loadGallery();
    loadLetters();
    loadMembersGrid();

    // Push notif: register SW + minta izin kalau belum
    ensurePushAfterLogin(name);

    // cek apakah anggota ini udah pernah isi biodata sendiri. kalau belum, minta isi dulu (sekali doang).
    const existingProfile = await getProfile(name);
    if(!existingProfile){
      openOnboarding(name);
    }
  }

  // ---------- musik di dalam website (HTML5 audio, full song) ----------
  const MUSIC_URL = "https://yatmsttajhpdzmhcqyup.supabase.co/storage/v1/object/public/media/Bebas.mp3"; // <-- tempel link file lagu di sini

  const musicBar = document.getElementById('musicBar');
  const musicCollapseBtn = document.getElementById('musicCollapseBtn');
  const bgAudio = document.getElementById('bgAudio');
  const musicPlayToggle = document.getElementById('musicPlayToggle');
  const musicProgress = document.getElementById('musicProgress');
  const musicCurrent = document.getElementById('musicCurrent');
  const musicDuration = document.getElementById('musicDuration');
  const musicMissing = document.getElementById('musicMissing');

  function fmtTime(sec){
    if(!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2,'0');
  }

  function showMusicBar(){
    if(!musicBar) return;
    musicBar.classList.add('show');
    if(MUSIC_URL && MUSIC_URL.trim()){
      if(bgAudio.src !== MUSIC_URL){
        bgAudio.src = MUSIC_URL.trim();
        bgAudio.load();
      }
      if(musicMissing) musicMissing.style.display = 'none';

      // Otomatis mulai memutar musik saat dashboard dibuka.
      // Kalau browser memblokir autoplay, musik akan mulai setelah interaksi pengguna.
      bgAudio.play().then(() => {
        if(musicPlayToggle) musicPlayToggle.textContent = '⏸';
      }).catch(() => {
        if(musicPlayToggle) musicPlayToggle.textContent = '▶';
      });
    } else {
      if(musicMissing){
        musicMissing.style.display = 'block';
        musicMissing.textContent = 'Belum ada file lagu. Isi MUSIC_URL di kode HTML (upload mp3 ke Supabase Storage dulu).';
      }
    }
  }
  document.addEventListener('pointerdown', function startMusicAfterInteraction(){
    if(!MUSIC_URL || !bgAudio || !bgAudio.paused) return;
    bgAudio.play().then(() => {
      if(musicPlayToggle) musicPlayToggle.textContent = '⏸';
      document.removeEventListener('pointerdown', startMusicAfterInteraction);
    }).catch(() => {});
  }, { once: false });

  function hideMusicBar(){
    if(!musicBar) return;
    musicBar.classList.remove('show');
    musicBar.classList.remove('expanded');
    if(bgAudio){ bgAudio.pause(); bgAudio.currentTime = 0; }
    if(musicPlayToggle) musicPlayToggle.textContent = '▶';
  }
  if(musicCollapseBtn){
    musicCollapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideMusicBar();
    });
  }

  // tap bubble buat buka panel kecilnya, tap di luar buat nutup lagi (musik tetap jalan)
  if(musicBar){
    musicBar.addEventListener('click', (e) => {
      if(e.target === musicPlayToggle || e.target === musicCollapseBtn) return;
      musicBar.classList.toggle('expanded');
    });
    document.addEventListener('pointerdown', (e) => {
      if(musicBar.classList.contains('expanded') && !musicBar.contains(e.target)){
        musicBar.classList.remove('expanded');
      }
    });
  }
  if(musicPlayToggle && bgAudio){
    musicPlayToggle.addEventListener('click', async () => {
      if(!MUSIC_URL || !MUSIC_URL.trim()){
        if(musicMissing){
          musicMissing.style.display = 'block';
          musicMissing.textContent = 'Belum ada file lagu. Isi MUSIC_URL dulu ya.';
        }
        return;
      }
      try{
        if(bgAudio.paused){
          await bgAudio.play();
          musicPlayToggle.textContent = '⏸';
        } else {
          bgAudio.pause();
          musicPlayToggle.textContent = '▶';
        }
      }catch(e){
        if(musicMissing){
          musicMissing.style.display = 'block';
          musicMissing.textContent = 'Gagal play. Cek link MUSIC_URL / izinkan audio di browser.';
        }
      }
    });
    bgAudio.addEventListener('timeupdate', () => {
      if(!bgAudio.duration) return;
      musicProgress.value = (bgAudio.currentTime / bgAudio.duration) * 100;
      musicCurrent.textContent = fmtTime(bgAudio.currentTime);
    });
    bgAudio.addEventListener('loadedmetadata', () => {
      musicDuration.textContent = fmtTime(bgAudio.duration);
    });
    bgAudio.addEventListener('ended', () => {
      musicPlayToggle.textContent = '▶';
    });
    musicProgress.addEventListener('input', () => {
      if(!bgAudio.duration) return;
      bgAudio.currentTime = (musicProgress.value / 100) * bgAudio.duration;
    });
  }

  // ---------- tab navigasi: Galeri / Biodata / Surat, biar gak perlu scroll panjang buat pindah ----------
  const sectionTabs = document.querySelectorAll('#sectionTabs .tab-btn');
  sectionTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      sectionTabs.forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === targetId);
      });
      document.getElementById('sectionTabs').scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });

  // ---------- upload helper: kompres foto jadi Blob JPEG ----------
  function resizeImageToBlob(file, maxWidth = 1200, quality = 0.8){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if(blob) resolve(blob); else reject(new Error('Gagal proses gambar'));
          }, 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Gagal baca gambar'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Gagal baca file'));
      reader.readAsDataURL(file);
    });
  }

  // ---------- upload helper: kirim file/blob ke Supabase Storage bucket 'media' ----------
  async function uploadToMedia(path, blobOrFile, contentType){
    const { error } = await sb.storage.from('media').upload(path, blobOrFile, { contentType, upsert: true });
    if(error) throw error;
    const { data } = sb.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }

  function uid(){
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2,9));
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function formatDate(ts){
    try{
      return new Date(ts).toLocaleString('id-ID', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }catch(e){ return ''; }
  }

  // ---------- biodata anggota: simpan & baca dari tabel 'profiles' ----------
  async function getProfile(name){
    const { data, error } = await sb.from('profiles').select('*').eq('name', name).maybeSingle();
    if(error){ console.error(error); return null; }
    return data;
  }

  async function saveProfile(name, profileData){
    const { error } = await sb.from('profiles').upsert({ name, ...profileData });
    if(error) throw error;
  }

  // ---------- ONBOARDING & EDIT PROFIL (modal yang sama dipakai buat dua-duanya) ----------
  // daftar field biodata: [kolom di tabel Supabase 'profiles', id input di form]
  const PROFILE_FIELDS = [
    ['nama_lengkap', 'onboardFullname'],
    ['role', 'onboardRole'],
    ['birthday', 'onboardBirthday'],
    ['zodiak', 'onboardZodiak'],
    ['domisili', 'onboardDomisili'],
    ['hobby', 'onboardHobby'],
    ['makanan_favorit', 'onboardMakanan'],
    ['warna_favorit', 'onboardWarna'],
    ['cita_cita', 'onboardCitaCita'],
    ['media_sosial', 'onboardMediaSosial'],
    ['quote', 'onboardQuote']
  ];

  const onboardModal    = document.getElementById('onboardModal');
  const onboardTitle    = document.getElementById('onboardTitle');
  const onboardSub      = document.getElementById('onboardSub');
  const onboardCloseBtn = document.getElementById('onboardCloseBtn');
  const onboardPhotoInput   = document.getElementById('onboardPhotoInput');
  const onboardPhotoPreview = document.getElementById('onboardPhotoPreview');
  const onboardSubmitBtn = document.getElementById('onboardSubmitBtn');
  const onboardStatus   = document.getElementById('onboardStatus');
  let onboardPhotoFile = null;
  let onboardExistingPhotoUrl = null;
  let onboardIsEdit = false;

  function openOnboarding(name, existingProfile){
    onboardIsEdit = !!existingProfile;
    onboardPhotoFile = null;
    onboardExistingPhotoUrl = existingProfile ? existingProfile.photo_url : null;

    PROFILE_FIELDS.forEach(([col, inputId]) => {
      const el = document.getElementById(inputId);
      let val = existingProfile ? existingProfile[col] : '';
      if(val === '-' || val === 'anggota sapulapojne' || val == null) val = '';
      el.value = val;
    });

    if(onboardIsEdit){
      onboardTitle.innerHTML = `Edit profil <span id="onboardName">${name}</span> ✨`;
      onboardSub.textContent = 'Ganti bagian yang mau kamu perbarui, sisanya biarin aja. Simpan kalau udah pas.';
      onboardPhotoPreview.innerHTML = existingProfile.photo_url ? `<img src="${existingProfile.photo_url}">` : '😊';
    } else {
      onboardTitle.innerHTML = `Yeay, halo <span id="onboardName">${name}</span> ✨`;
      onboardSub.textContent = 'Ini pertama kalinya kamu masuk, jadi lengkapi dulu biodatamu ya. Cukup sekali aja kok — abis ini di device yang sama kamu langsung masuk tanpa isi password lagi.';
      onboardPhotoPreview.innerHTML = '😊';
    }
    onboardStatus.textContent = '';
    onboardModal.classList.add('show');
  }

  onboardCloseBtn.addEventListener('click', () => {
    onboardModal.classList.remove('show');
  });

  document.getElementById('editProfileBtn').addEventListener('click', async () => {
    if(needsSupabaseSetup()) return;
    const name = safeStorage.get('sapulapojne_user');
    if(!name) return;
    const existing = await getProfile(name);
    openOnboarding(name, existing || {});
  });

  onboardPhotoInput.addEventListener('change', () => {
    const file = onboardPhotoInput.files[0];
    if(!file) return;
    onboardPhotoFile = file;
    onboardPhotoPreview.innerHTML = `<img src="${URL.createObjectURL(file)}">`;
  });

  onboardSubmitBtn.addEventListener('click', async () => {
    const name = safeStorage.get('sapulapojne_user');
    onboardSubmitBtn.disabled = true;
    onboardStatus.textContent = 'Menyimpan...';
    try{
      let photoUrl = onboardExistingPhotoUrl || null;
      if(onboardPhotoFile){
        onboardStatus.textContent = 'Mengunggah foto...';
        const blob = await resizeImageToBlob(onboardPhotoFile, 600, 0.82);
        photoUrl = await uploadToMedia(`profiles/${name.toLowerCase()}-${Date.now()}.jpg`, blob, 'image/jpeg');
      }
      const profileData = { photo_url: photoUrl };
      PROFILE_FIELDS.forEach(([col, inputId]) => {
        const val = document.getElementById(inputId).value.trim();
        if(col === 'role') profileData[col] = val || 'anggota sapulapojne';
        else if(col === 'birthday' || col === 'hobby') profileData[col] = val || '-';
        else profileData[col] = val || '';
      });
      onboardStatus.textContent = 'Menyimpan profil...';
      await saveProfile(name, profileData);
      onboardStatus.textContent = 'Tersimpan! ✨';
      setTimeout(() => {
        onboardModal.classList.remove('show');
        loadMembersGrid();
      }, 500);
    }catch(err){
      console.error(err);
      onboardStatus.textContent = 'Gagal nyimpen, coba lagi ya.';
    }finally{
      onboardSubmitBtn.disabled = false;
    }
  });

  // ---------- render kartu biodata semua anggota (yang belum isi ditandai) ----------
  // label tampilan buat tiap kolom biodata (di luar nama, julukan & quote yang punya tempat sendiri)
  const BIO_DISPLAY_FIELDS = [
    ['nama_lengkap', 'Nama lengkap'],
    ['birthday', 'Tanggal lahir'],
    ['zodiak', 'Zodiak'],
    ['domisili', 'Domisili'],
    ['hobby', 'Hobi'],
    ['makanan_favorit', 'Makanan favorit'],
    ['warna_favorit', 'Warna favorit'],
    ['cita_cita', 'Cita-cita'],
    ['media_sosial', 'Media sosial']
  ];

  async function loadMembersGrid(){
    const grid = document.getElementById('membersGrid');
    if(!sb) return;
    grid.innerHTML = '';
    for(const m of MEMBERS){
      const profile = await getProfile(m.name);
      const initials = m.name.slice(0,2).toUpperCase();
      const div = document.createElement('div');

      if(profile){
        div.className = 'member-card';
        const avatarInner = profile.photo_url ? `<img src="${profile.photo_url}">` : initials;
        const bioItems = BIO_DISPLAY_FIELDS
          .filter(([col]) => profile[col] && profile[col] !== '-')
          .map(([col, label]) => `<li><strong>${label}</strong>${escapeHtml(profile[col])}</li>`)
          .join('');
        div.innerHTML = `
          <div class="member-head">
            <div class="member-avatar" style="background:${m.color}">${avatarInner}</div>
            <div>
              <h3>${escapeHtml(m.name)}</h3>
              <p class="member-role">${escapeHtml(profile.role)}</p>
            </div>
          </div>
          <ul class="member-bio">${bioItems}</ul>
          ${profile.quote ? `<p class="member-quote">"${escapeHtml(profile.quote)}"</p>` : ''}
        `;
      } else {
        div.className = 'member-card unfilled';
        div.innerHTML = `
          <div class="member-head">
            <div class="member-avatar" style="background:${m.color}">${initials}</div>
            <div>
              <h3>${escapeHtml(m.name)}</h3>
              <p class="member-role">belum lengkapi profil</p>
            </div>
          </div>
          <p class="member-empty-note">⏳ Ups, ${escapeHtml(m.name)} belum memperbarui biodatanya nih. Sabar nunggu dia login ya ✨</p>
        `;
      }
      grid.appendChild(div);
    }
  }

  // ---------- GALERI FOTO/VIDEO + KOMENTAR (disimpan bersama, keliatan semua orang) ----------
  const photoInput      = document.getElementById('photoInput');
  const previewThumb    = document.getElementById('previewThumb');
  const previewVideoLbl = document.getElementById('previewVideoLabel');
  const captionInput    = document.getElementById('captionInput');
  const addPhotoBtn     = document.getElementById('addPhotoBtn');
  const uploadStatus    = document.getElementById('uploadStatus');
  const galleryGrid     = document.getElementById('galleryGrid');

  const MAX_VIDEO_MB = 50;
  let pendingFile = null;
  let pendingType = null; // 'photo' | 'video'

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if(!file) return;
    previewThumb.style.display = 'none';
    previewVideoLbl.style.display = 'none';
    uploadStatus.className = 'status-line';

    if(file.type.startsWith('video/')){
      if(file.size > MAX_VIDEO_MB * 1024 * 1024){
        uploadStatus.textContent = `Videonya kegedean (maks ${MAX_VIDEO_MB}MB), pilih yang lebih kecil ya.`;
        uploadStatus.className = 'status-line err';
        pendingFile = null; pendingType = null;
        return;
      }
      pendingFile = file; pendingType = 'video';
      previewVideoLbl.style.display = 'inline';
      previewVideoLbl.textContent = `🎬 ${file.name}`;
      uploadStatus.textContent = 'Video siap, tambahin keterangan lalu tekan Upload.';
    } else {
      pendingFile = file; pendingType = 'photo';
      previewThumb.src = URL.createObjectURL(file);
      previewThumb.style.display = 'inline-block';
      uploadStatus.textContent = 'Foto siap, tambahin keterangan lalu tekan Upload.';
    }
  });

  addPhotoBtn.addEventListener('click', async () => {
    if(needsSupabaseSetup()) return;
    const uploader = safeStorage.get('sapulapojne_user') || 'Anonim';
    const caption = captionInput.value.trim();

    if(!pendingFile){
      uploadStatus.textContent = 'Pilih foto/video dulu ya.';
      uploadStatus.className = 'status-line err';
      return;
    }

    addPhotoBtn.disabled = true;
    uploadStatus.innerHTML = '<span class="spinner"></span> Mengunggah...';
    uploadStatus.className = 'status-line';

    try{
      let blobToUpload = pendingFile;
      let ext = 'jpg';
      let contentType = pendingFile.type || 'image/jpeg';
      if(pendingType === 'photo'){
        blobToUpload = await resizeImageToBlob(pendingFile, 1400, 0.78);
        contentType = 'image/jpeg';
      } else {
        ext = (pendingFile.name.split('.').pop() || 'mp4').toLowerCase();
      }
      const path = `gallery/${uid()}.${ext}`;
      const mediaUrl = await uploadToMedia(path, blobToUpload, contentType);

      const { error } = await sb.from('gallery_items').insert({
        uploader,
        media_type: pendingType,
        media_path: path,
        media_url: mediaUrl,
        caption: caption || '(tanpa keterangan)'
      });
      if(error) throw error;

      pendingFile = null; pendingType = null;
      photoInput.value = '';
      captionInput.value = '';
      previewThumb.style.display = 'none';
      previewVideoLbl.style.display = 'none';
      uploadStatus.textContent = 'Berhasil diupload ✨';
      loadGallery();
    }catch(err){
      console.error(err);
      uploadStatus.textContent = 'Gagal upload, coba lagi ya.';
      uploadStatus.className = 'status-line err';
    }finally{
      addPhotoBtn.disabled = false;
    }
  });

  async function loadCommentsGroupedByItem(){
    const grouped = {};
    try{
      const { data } = await sb.from('gallery_comments').select('*').order('created_at', { ascending: true });
      (data || []).forEach(c => {
        if(!grouped[c.item_id]) grouped[c.item_id] = [];
        grouped[c.item_id].push(c);
      });
    }catch(e){ /* tidak ada komentar sama sekali */ }
    return grouped;
  }

  // galeri sekarang tampil sebagai grid thumbnail kecil; pencet salah satu buat lihat gede + komen di lightbox
  let galleryItems = [];
  let galleryCommentsByItem = {};
  let lightboxIndex = -1;

  async function loadGallery(){
    galleryGrid.innerHTML = '<div class="empty-state"><span class="spinner"></span> Memuat galeri...</div>';
    if(!sb) return;
    try{
      const { data: items, error } = await sb.from('gallery_items').select('*').order('created_at', { ascending: false });
      if(error) throw error;

      galleryItems = items || [];

      if(galleryItems.length === 0){
        galleryGrid.innerHTML = '<div class="empty-state">Galeri masih kosong. Jadi yang pertama upload foto/video! 📷</div>';
        return;
      }

      galleryCommentsByItem = await loadCommentsGroupedByItem();
      galleryGrid.innerHTML = '';

      galleryItems.forEach((item, idx) => {
        const thumbMediaHtml = item.media_type === 'video'
          ? `<video src="${item.media_url}" playsinline muted></video><span class="video-badge">🎬 video</span>`
          : `<img src="${item.media_url}" alt="${escapeHtml(item.caption)}" loading="lazy">`;

        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb';
        thumb.innerHTML = `
          ${thumbMediaHtml}
          <div class="thumb-overlay"><span class="thumb-caption">${escapeHtml(item.caption)}</span></div>
        `;
        thumb.addEventListener('click', () => openLightbox(idx));
        galleryGrid.appendChild(thumb);
      });

    }catch(err){
      console.error(err);
      galleryGrid.innerHTML = '<div class="empty-state">Galeri gagal dimuat. Coba refresh halaman ya.</div>';
    }
  }

  // ---------- LIGHTBOX: buka foto/video ukuran penuh, geser kiri-kanan, komen ----------
  const lightboxModal   = document.getElementById('lightboxModal');
  const lightboxMedia   = document.getElementById('lightboxMedia');
  const lightboxUploader = document.getElementById('lightboxUploader');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxComments = document.getElementById('lightboxComments');
  const lightboxDelBtn  = document.getElementById('lightboxDelBtn');
  const lightboxCommentInput = document.getElementById('lightboxCommentInput');
  const lightboxCommentSend  = document.getElementById('lightboxCommentSend');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxClose = document.getElementById('lightboxClose');

  function renderLightbox(){
    const item = galleryItems[lightboxIndex];
    if(!item) return;
    const currentUser = safeStorage.get('sapulapojne_user');

    lightboxMedia.innerHTML = item.media_type === 'video'
      ? `<video src="${item.media_url}" controls playsinline autoplay></video>`
      : `<img src="${item.media_url}" alt="${escapeHtml(item.caption)}">`;

    lightboxUploader.textContent = item.uploader;
    lightboxCaption.textContent = item.caption;

    const canDelete = item.uploader === currentUser;
    lightboxDelBtn.style.display = canDelete ? 'inline' : 'none';
    lightboxDelBtn.textContent = 'Hapus';

    const comments = galleryCommentsByItem[item.id] || [];
    lightboxComments.innerHTML = comments.length
      ? comments.map(c => `<div class="comment-item"><strong>${escapeHtml(c.author)}:</strong> ${escapeHtml(c.text)}</div>`).join('')
      : `<div class="comment-empty">Belum ada komentar.</div>`;
    lightboxCommentInput.value = '';

    lightboxPrev.disabled = lightboxIndex <= 0;
    lightboxNext.disabled = lightboxIndex >= galleryItems.length - 1;
  }

  function openLightbox(idx){
    lightboxIndex = idx;
    renderLightbox();
    lightboxModal.classList.add('show');
  }

  function closeLightbox(){
    lightboxModal.classList.remove('show');
    lightboxMedia.innerHTML = '';
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => { if(e.target === lightboxModal) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if(!lightboxModal.classList.contains('show')) return;
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowLeft' && !lightboxPrev.disabled) openLightbox(lightboxIndex - 1);
    if(e.key === 'ArrowRight' && !lightboxNext.disabled) openLightbox(lightboxIndex + 1);
  });
  lightboxPrev.addEventListener('click', () => { if(!lightboxPrev.disabled) openLightbox(lightboxIndex - 1); });
  lightboxNext.addEventListener('click', () => { if(!lightboxNext.disabled) openLightbox(lightboxIndex + 1); });

  lightboxDelBtn.addEventListener('click', async () => {
    const item = galleryItems[lightboxIndex];
    if(!item) return;
    lightboxDelBtn.textContent = '...';
    try{
      if(item.media_path) await sb.storage.from('media').remove([item.media_path]);
      await sb.from('gallery_items').delete().eq('id', item.id);
      closeLightbox();
      loadGallery();
    }catch(e){
      lightboxDelBtn.textContent = 'Hapus';
    }
  });

  async function submitLightboxComment(){
    const item = galleryItems[lightboxIndex];
    if(!item) return;
    const text = lightboxCommentInput.value.trim();
    const author = safeStorage.get('sapulapojne_user') || 'Anonim';
    if(!text) return;

    lightboxCommentSend.disabled = true;
    try{
      const { error } = await sb.from('gallery_comments').insert({ item_id: item.id, author, text });
      if(error) throw error;
      galleryCommentsByItem = await loadCommentsGroupedByItem();
      renderLightbox();
    }catch(e){
      /* biarin, user bisa coba lagi */
    }finally{
      lightboxCommentSend.disabled = false;
    }
  }

  lightboxCommentSend.addEventListener('click', submitLightboxComment);
  lightboxCommentInput.addEventListener('keydown', e => { if(e.key === 'Enter') submitLightboxComment(); });

  // ---------- SURAT UNTUK KITA ----------
  const letterInput   = document.getElementById('letterInput');
  const sendLetterBtn = document.getElementById('sendLetterBtn');
  const letterStatus  = document.getElementById('letterStatus');
  const lettersList   = document.getElementById('lettersList');

  async function loadLetterCommentsGrouped(){
    const grouped = {};
    try{
      const { data } = await sb.from('letter_comments').select('*').order('created_at', { ascending: true });
      (data || []).forEach(c => {
        if(!grouped[c.letter_id]) grouped[c.letter_id] = [];
        grouped[c.letter_id].push(c);
      });
    }catch(e){ /* belum ada komentar surat */ }
    return grouped;
  }

  async function loadLetters(){
    lettersList.innerHTML = '<div class="empty-state"><span class="spinner"></span> Memuat surat...</div>';
    if(!sb) return;
    try{
      const { data: items, error } = await sb.from('letters').select('*').order('created_at', { ascending: false });
      if(error) throw error;

      if(!items || items.length === 0){
        lettersList.innerHTML = '<div class="empty-state">Belum ada surat. Tulis yang pertama yuk 💌</div>';
        return;
      }

      const commentsByLetter = await loadLetterCommentsGrouped();
      const currentUser = safeStorage.get('sapulapojne_user');
      lettersList.innerHTML = '';

      items.forEach(item => {
        const canDelete = item.author === currentUser;
        const comments = commentsByLetter[item.id] || [];
        const commentHtml = comments.length
          ? comments.map(c => `<div class="comment-item"><strong>${escapeHtml(c.author)}:</strong> ${escapeHtml(c.text)}</div>`).join('')
          : `<div class="comment-empty">Belum ada komentar.</div>`;

        const card = document.createElement('div');
        card.className = 'letter-card';
        card.innerHTML = `
          <div class="letter-author">${escapeHtml(item.author)}</div>
          <p class="letter-text">${escapeHtml(item.message)}</p>
          <div class="letter-meta">
            <span class="letter-time">${formatDate(item.created_at)}</span>
            ${canDelete ? `<button class="del-btn" data-letterid="${item.id}">Hapus</button>` : ``}
          </div>
          <div class="comment-list">${commentHtml}</div>
          <div class="comment-form">
            <input type="text" class="comment-input" placeholder="Tulis komentar..." data-letter="${item.id}">
            <button class="comment-send" data-letter="${item.id}">Kirim</button>
          </div>
        `;
        lettersList.appendChild(card);
      });

      lettersList.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-letterid');
          btn.textContent = '...';
          try{
            await sb.from('letters').delete().eq('id', id);
            loadLetters();
          }catch(e){
            btn.textContent = 'Hapus';
          }
        });
      });

      lettersList.querySelectorAll('.comment-send').forEach(btn => {
        btn.addEventListener('click', () => submitLetterComment(btn));
      });
      lettersList.querySelectorAll('.comment-input').forEach(inp => {
        inp.addEventListener('keydown', e => {
          if(e.key === 'Enter'){
            const btn = lettersList.querySelector(`.comment-send[data-letter="${inp.getAttribute('data-letter')}"]`);
            if(btn) submitLetterComment(btn);
          }
        });
      });

    }catch(err){
      console.error(err);
      lettersList.innerHTML = '<div class="empty-state">Surat gagal dimuat. Coba refresh halaman ya.</div>';
    }
  }

  async function submitLetterComment(btn){
    const letterId = btn.getAttribute('data-letter');
    const input = lettersList.querySelector(`.comment-input[data-letter="${letterId}"]`);
    const text = input.value.trim();
    const author = safeStorage.get('sapulapojne_user') || 'Anonim';
    if(!text) return;

    btn.disabled = true;
    try{
      const { error } = await sb.from('letter_comments').insert({ letter_id: letterId, author, text });
      if(error) throw error;
      loadLetters();
    }catch(e){
      btn.disabled = false;
    }
  }

  sendLetterBtn.addEventListener('click', async () => {
    if(needsSupabaseSetup()) return;
    const author = safeStorage.get('sapulapojne_user') || 'Anonim';
    const message = letterInput.value.trim();
    if(!message){
      letterStatus.textContent = 'Tulis suratnya dulu ya.';
      letterStatus.className = 'status-line err';
      return;
    }
    sendLetterBtn.disabled = true;
    letterStatus.innerHTML = '<span class="spinner"></span> Mengirim...';
    letterStatus.className = 'status-line';

    try{
      const { error } = await sb.from('letters').insert({ author, message });
      if(error) throw error;
      letterInput.value = '';
      letterStatus.textContent = 'Surat terkirim 💌';
      loadLetters();
    }catch(err){
      console.error(err);
      letterStatus.textContent = 'Gagal kirim surat, coba lagi.';
      letterStatus.className = 'status-line err';
    }finally{
      sendLetterBtn.disabled = false;
    }
  });

  unlockBtn.addEventListener('click', tryUnlock);
  pwInput.addEventListener('keydown', e => { if(e.key === 'Enter') tryUnlock(); });
  if (pwConfirmInput) {
    pwConfirmInput.addEventListener('keydown', e => { if(e.key === 'Enter') tryUnlock(); });
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    safeStorage.remove('sapulapojne_user');
    dashboard.classList.remove('show');
    lockScreen.classList.remove('hide');
    hideMusicBar();
    pwInput.value = '';
    errorMsg.textContent = '';
  });

  window.addEventListener('DOMContentLoaded', () => {
    setupNotifBannerHandlers();

    if(!sb){
      errorMsg.textContent = 'Supabase belum disambungkan. Lihat SETUP.md.';
    } else {
      const saved = safeStorage.get('sapulapojne_user');
      if(saved){ enterDashboard(saved); } else {
        loadMembersGrid();
      }
    }

    const leafLayer = document.getElementById('leafLayer');
    const fallingEmojis = ['🐱','🦕','🐯','🐈‍⬛','🐻','✨'];
    for(let i=0;i<14;i++){
      const leaf = document.createElement('div');
      leaf.className = 'leaf';
      leaf.textContent = fallingEmojis[Math.floor(Math.random()*fallingEmojis.length)];
      leaf.style.left = Math.random()*100 + 'vw';
      leaf.style.animationDuration = (10 + Math.random()*10) + 's';
      leaf.style.animationDelay = (Math.random()*10) + 's';
      leaf.style.fontSize = (16 + Math.random()*14) + 'px';
      leafLayer.appendChild(leaf);
    }
  });
