export function _readAll() {
  try { return JSON.parse(localStorage.getItem('notifications')||'[]'); } catch (e) { return []; }
}

export function getNotificationsForUser(user) {
  if (!user) return [];
  const all = _readAll();
  if (user.role === 'admin') return all.slice().sort((a,b)=>b.date-a.date);
  return all.filter(n => String(n.userId) === String(user.id || user.email)).sort((a,b)=>b.date-a.date);
}

export function addNotification(n) {
  const all = _readAll();
  const now = Date.now();
  const notif = { id: n.id || ('n_' + now + '_' + Math.floor(Math.random()*10000)), title: n.title||'', body: n.body||'', date: n.date||now, userId: n.userId, read: !!n.read };
  all.push(notif);
  try { localStorage.setItem('notifications', JSON.stringify(all)); } catch (e) {}
  return notif;
}

export function markAllReadForUser(user) {
  if (!user) return;
  const all = _readAll();
  let changed = false;
  const uid = user.id || user.email;
  for (let i=0;i<all.length;i++) {
    if (String(all[i].userId) === String(uid) && !all[i].read) { all[i].read = true; changed = true; }
  }
  if (user.role === 'admin') {
    // mark all as read for admins
    for (let i=0;i<all.length;i++) if (!all[i].read) { all[i].read = true; changed = true; }
  }
  if (changed) try { localStorage.setItem('notifications', JSON.stringify(all)); } catch (e) {}
}

export function unreadCountForUser(user) {
  if (!user) return 0;
  const all = _readAll();
  if (user.role === 'admin') return all.filter(n=>!n.read).length;
  const uid = user.id || user.email;
  return all.filter(n=>String(n.userId) === String(uid) && !n.read).length;
}

export function clearNotifications() {
  try { localStorage.removeItem('notifications'); } catch(e){}
}
