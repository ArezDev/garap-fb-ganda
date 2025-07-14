/* global window */
window.AREZDEV_CONFIG = {

  // delay antara buka browser
  browserLaunchDelaySec: 7, // delay in seconds before launching browser

  // Aktif/Non‑aktif fitur
  enableCreateGroups: true, // buat grup baru
  enableAddMembersToGroups: false, // tambah anggota ke semua grup
  enableMessageAllGroups: false, // kirim pesan ke semua grup

  // Pengaturan add members 
  addMemberWithText: false, // langsung pesan setelah menambah anggota
  welcomeText: [
    'Selamat datang semuanya 🎉',
    'Halo, terima kasih sudah join!',
    'Yuk ngobrol di sini!'
  ],

  // Nilai default
  delaySec: 1, // detik
  membersPerBatch: 200, // jumlah uid per batch saat menambah anggota
  membersPerGroup: 1, // maksimal anggota per grup

  // Custom logger: kirim balik ke console di browser
  logger: (type, payload) => {
    console.log(`[AREZ] ${type} ${JSON.stringify(payload)}`);
  }
};
