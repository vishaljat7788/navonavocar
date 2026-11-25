const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// Vercel's deployment filesystem is read-only. /tmp is writable, though it is
// ephemeral; use a persistent database before relying on accounts in production.
const DB_FILE = process.env.VERCEL
  ? path.join('/tmp', 'navonavocar-db.json')
  : path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'navonavocar-uploads')
  : path.join(__dirname, 'public', 'uploads');
const SERVICE_FEE = 0.1;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CITIES = ['Ahmedabad','Surat','Vadodara','Rajkot','Gandhinagar','Mumbai','Pune','Nashik','Delhi','Gurgaon','Noida','Jaipur','Chandigarh','Meerut','Ghaziabad','Rohtak','Bengaluru','Hyderabad','Chennai','Lucknow','Indore','Bhopal','Udaipur','Kolkata'];

/* ---------- tiny JSON database ---------- */
function seed() {
  const d = new Date(); const day = n => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const db = { users: [{ id: 'u1', name: 'Amit Patel', email: 'demo@navonavocar.in', pass: hash('demo1234'), phone: '9000000001' }],
    rides: [
      ['Ahmedabad','Surat','07:30',420,3,0],['Ahmedabad','Vadodara','09:00',180,2,0],['Mumbai','Pune','06:45',350,3,1],
      ['Gurgaon','Jaipur','08:15',450,2,1],['Delhi','Chandigarh','05:30',500,3,2],['Pune','Nashik','10:00',300,2,2],
      ['Meerut','Ghaziabad','17:00',120,3,0],['Bengaluru','Hyderabad','21:00',900,3,3]
    ].map((r, i) => ({ id: 'r' + (i + 1), driverId: 'u1', from: r[0], to: r[1], date: day(r[5]), time: r[2], price: r[3], seats: r[4], car: 'Maruti Swift (White)', note: 'AC on. One bag per seat.', instant: i % 2 === 0 })),
    bookings: [], alerts: [] };
  save(db); return db;
}
function load() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return seed(); } }
function save(db) { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
const uid = p => p + crypto.randomBytes(5).toString('hex');

/* ---------- auth (scrypt + cookie sessions) ---------- */
function hash(pw) { const s = crypto.randomBytes(8).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); }
function verify(pw, h) { const [s, k] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(k, 'hex'), crypto.scryptSync(pw, s, 32)); }
app.use((req, res, next) => {
  const c = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => {
    const i = x.indexOf('='); return i < 0 ? [x.trim(), ''] : [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1).trim())];
  }));
  req.db = load();
  // Keep the session in a signed, HttpOnly cookie. An in-memory session map
  // loses every login between Vercel serverless invocations.
  const [sessionUserId, sessionSignature] = (c.sid || '').split('.');
  const sessionUser = req.db.users.find(u => u.id === sessionUserId);
  const expectedSignature = sessionUser && crypto.createHmac('sha256', sessionUser.pass).update(sessionUser.id).digest('hex');
  const supplied = Buffer.from(sessionSignature || '');
  const expected = Buffer.from(expectedSignature || '');
  req.user = sessionUser && supplied.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(supplied, expected) ? sessionUser : null;
  res.locals.user = req.user; res.locals.cities = CITIES; res.locals.today = new Date().toISOString().slice(0, 10);
  res.locals.fee = SERVICE_FEE; res.locals.v = {}; res.locals.q = {}; res.locals.error = null; res.locals.path = req.path;
  next();
});
const need = (req, res, next) => req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
const withSeatsLeft = (db, r) => ({ ...r, left: r.seats - db.bookings.filter(b => b.rideId === r.id && b.status === 'confirmed').reduce((a, b) => a + b.seats, 0), driver: db.users.find(u => u.id === r.driverId) });

/* ---------- pages ---------- */
app.get('/uploads/:filename', (req, res, next) => {
  if (!/^profile-[a-f0-9]+\.(png|jpe?g|webp)$/.test(req.params.filename)) return next();
  res.sendFile(path.join(UPLOAD_DIR, req.params.filename), err => { if (err && !res.headersSent) next(); });
});

app.get('/', (req, res) => {
  const routes = [...new Map(req.db.rides.map(r => [r.from + r.to, r])).values()].slice(0, 6);
  res.render('home', { routes });
});

app.get('/search', (req, res) => {
  const { from = '', to = '', date = '', seats = 1 } = req.query;
  const has = (a, b) => !b || a.toLowerCase().includes(b.trim().toLowerCase());
  const rides = req.db.rides.map(r => withSeatsLeft(req.db, r))
    .filter(r => has(r.from, from) && has(r.to, to) && (!date || r.date === date) && r.left >= Number(seats) && r.date >= res.locals.today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.render('search', { rides, q: { from, to, date, seats } });
});

app.get('/ride/:id', (req, res) => {
  const r = req.db.rides.find(x => x.id === req.params.id); if (!r) return res.status(404).render('message', { title: 'Ride not found', text: 'This ride has been removed or does not exist.' });
  res.render('ride', { ride: withSeatsLeft(req.db, r), error: req.query.error || null });
});

app.post('/ride/:id/book', need, (req, res) => {
  const r = req.db.rides.find(x => x.id === req.params.id); if (!r) return res.redirect('/');
  const n = Math.max(1, Number(req.body.seats) || 1); const left = withSeatsLeft(req.db, r).left;
  if (r.driverId === req.user.id) return res.redirect(`/ride/${r.id}?error=You can't book your own ride`);
  if (n > left) return res.redirect(`/ride/${r.id}?error=Only ${left} seat(s) left`);
  const total = Math.round(r.price * n * (1 + SERVICE_FEE));
  req.db.bookings.push({ id: uid('b'), rideId: r.id, userId: req.user.id, seats: n, total, status: r.instant ? 'confirmed' : 'pending', createdAt: Date.now() });
  save(req.db); res.redirect('/my-rides');
});

app.post('/booking/:id/cancel', need, (req, res) => {
  const b = req.db.bookings.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (b) { b.status = 'cancelled'; save(req.db); } res.redirect('/my-rides');
});

app.post('/booking/:id/:action(accept|decline)', need, (req, res) => {
  const b = req.db.bookings.find(x => x.id === req.params.id); const r = b && req.db.rides.find(x => x.id === b.rideId);
  if (b && r && r.driverId === req.user.id) { b.status = req.params.action === 'accept' ? 'confirmed' : 'declined'; save(req.db); } res.redirect('/my-rides');
});

app.get('/offer', need, (req, res) => res.render('offer'));
app.post('/offer', need, (req, res) => {
  const { from, to, date, time, price, seats, car, note, instant } = req.body;
  if (!from || !to || from.trim().toLowerCase() === to.trim().toLowerCase() || !date || !time || !(Number(price) > 0))
    return res.render('offer', { error: 'Please fill in all fields correctly. Departure and destination must be different.', q: req.body });
  const ride = { id: uid('r'), driverId: req.user.id, from: from.trim(), to: to.trim(), date, time, price: Number(price), seats: Math.min(8, Math.max(1, Number(seats) || 1)), car: car || '', note: note || '', instant: !!instant };
  req.db.rides.push(ride);
  req.db.alerts.filter(a => a.from.toLowerCase() === ride.from.toLowerCase() && a.to.toLowerCase() === ride.to.toLowerCase())
    .forEach(a => console.log(`[ALERT] ${a.email}: new ride ${ride.from} -> ${ride.to}`));
  save(req.db); res.redirect('/ride/' + ride.id);
});

app.get('/my-rides', need, (req, res) => {
  const db = req.db;
  const booked = db.bookings.filter(b => b.userId === req.user.id).map(b => ({ ...b, ride: withSeatsLeft(db, db.rides.find(r => r.id === b.rideId)) })).reverse();
  const offered = db.rides.filter(r => r.driverId === req.user.id).map(r => ({ ...withSeatsLeft(db, r),
    requests: db.bookings.filter(b => b.rideId === r.id && b.status !== 'cancelled').map(b => ({ ...b, passenger: db.users.find(u => u.id === b.userId) })) }));
  res.render('my-rides', { booked, offered });
});

app.post('/alerts', (req, res) => {
  const { from, to, email } = req.body;
  if (from && to && /\S+@\S+\.\S+/.test(email || '')) { req.db.alerts.push({ id: uid('a'), from, to, email }); save(req.db); }
  res.render('message', { title: 'Alert created', text: `We'll email ${email} as soon as a new ride is published for ${from} → ${to}.` });
});

app.get('/register', (req, res) => res.render('auth', { mode: 'register', next: req.query.next || '/' }));
app.post('/register', (req, res) => {
  const { name, email, phone, password, photoData } = req.body; const next = req.body.next || '/';
  const emailAddress = (email || '').trim().toLowerCase();
  const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/.test(password || '');
  let bad = !name || !name.trim() ? 'Please enter your full name.'
    : !/^\S+@\S+\.\S+$/.test(emailAddress) ? 'Please enter a valid email address.'
    : !/^\d{10}$/.test(phone || '') ? 'Mobile number must contain exactly 10 digits.'
    : !passwordValid ? 'Password must be at least 8 characters and include uppercase, lowercase, number and special character.'
    : req.db.users.some(u => u.email === emailAddress) ? 'An account with this email already exists.' : null;
  let photo = null;
  if (!bad) {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(photoData || '');
    if (!match) bad = 'Please upload a PNG, JPG or WEBP profile photo.';
    else {
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > 2 * 1024 * 1024) bad = 'Profile photo must be smaller than 2 MB.';
      else {
        const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!(isPng && ext === 'png') && !(isJpg && ext === 'jpg') && !(isWebp && ext === 'webp')) bad = 'The selected file is not a valid image.';
        else {
          const filename = `profile-${crypto.randomBytes(12).toString('hex')}.${ext}`;
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
          fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes);
          photo = `/uploads/${filename}`;
        }
      }
    }
  }
  if (bad) return res.render('auth', { mode: 'register', next, error: bad, v: { name, email, phone } });
  const u = { id: uid('u'), name: name.trim(), email: emailAddress, phone, photo, pass: hash(password) };
  req.db.users.push(u); save(req.db); login(res, u); res.redirect(next);
});
app.get('/login', (req, res) => res.render('auth', { mode: 'login', next: req.query.next || '/' }));
app.post('/login', (req, res) => {
  const u = req.db.users.find(x => x.email === (req.body.email || '').toLowerCase()); const next = req.body.next || '/';
  if (!u || !verify(req.body.password || '', u.pass)) return res.render('auth', { mode: 'login', next, error: 'Incorrect email or password.', v: req.body });
  login(res, u); res.redirect(next);
});
app.get('/logout', (req, res) => { res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.redirect('/'); });
function login(res, u) {
  const signature = crypto.createHmac('sha256', u.pass).update(u.id).digest('hex');
  res.setHeader('Set-Cookie', `sid=${u.id}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.VERCEL ? '; Secure' : ''}`);
}

app.use((req, res) => res.status(404).render('message', { title: '404', text: 'This page could not be found.' }));
// Vercel imports the Express app as a serverless function; local runs still
// start an HTTP listener.
if (require.main === module) app.listen(PORT, () => console.log(`NavoNavoCar is running at http://localhost:${PORT}`));

module.exports = app;
