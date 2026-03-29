// ClassClaw — auth
// Firebase authentication: Google login/logout, auth state listener

auth.onAuthStateChanged(function(user) {
  currentUser = user;
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('lobby').classList.add('active');
    document.getElementById('lobbyAvatar').src = user.photoURL || '';
    document.getElementById('lobbyName').textContent = user.displayName || user.email;
    var today = new Date();
    document.getElementById('datePrefix').textContent = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0') + '-';
    initGlobalSettings();
    loadSettingsFromFirebase();
    loadCustomMaterials();
    loadCourseList();
    loadRoomList();
    loadTodayClasses();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('lobby').classList.remove('active');
  }
});

function googleLogin() {
  var provider = new firebase.auth.GoogleAuthProvider();
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    auth.signInWithRedirect(provider);
  } else {
    auth.signInWithPopup(provider).catch(function(e) {
      showNotification('error', e.message);
    });
  }
}

function googleLogout() {
  if (confirm('\u767B\u51FA\uFF1F')) {
    auth.signOut().then(function() { location.reload(); });
  }
}
