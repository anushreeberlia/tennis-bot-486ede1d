const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const { Expo } = require('expo-server-sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/data.json';

app.use(cors());
app.use(express.json());

const expo = new Expo();

// Initialize database
let db = {
  users: [],
  checks: [],
  availableCourts: []
};

// Load database
if (fs.existsSync(DB_PATH)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (error) {
    console.log('Error loading database, using empty db');
  }
}

// Save database
function saveDB() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Mock court availability check (replace with real API call)
async function checkCourtAvailability() {
  try {
    console.log('Checking Joe DiMaggio tennis courts...');
    
    // Simulate API call - replace with actual SF Parks API
    const availability = {
      courtName: 'Joe DiMaggio Tennis Courts',
      date: new Date().toISOString().split('T')[0],
      timeSlots: [
        { time: '5:00 PM', available: Math.random() > 0.7 },
        { time: '6:00 PM', available: Math.random() > 0.7 },
        { time: '7:00 PM', available: Math.random() > 0.7 },
        { time: '8:00 PM', available: Math.random() > 0.7 }
      ]
    };
    
    const availableSlots = availability.timeSlots.filter(slot => slot.available);
    
    const checkRecord = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      availableSlots: availableSlots.length,
      slots: availableSlots
    };
    
    db.checks.push(checkRecord);
    
    // Keep only last 50 checks
    if (db.checks.length > 50) {
      db.checks = db.checks.slice(-50);
    }
    
    // Send notifications if courts are available
    if (availableSlots.length > 0) {
      await sendNotifications(availableSlots);
      db.availableCourts = availableSlots;
    } else {
      db.availableCourts = [];
    }
    
    saveDB();
    return availability;
  } catch (error) {
    console.error('Error checking court availability:', error);
    return null;
  }
}

// Send push notifications
async function sendNotifications(availableSlots) {
  const messages = [];
  
  for (const user of db.users.filter(u => u.notificationsEnabled)) {
    if (!Expo.isExpoPushToken(user.pushToken)) {
      continue;
    }
    
    const slotTimes = availableSlots.map(slot => slot.time).join(', ');
    
    messages.push({
      to: user.pushToken,
      sound: 'default',
      title: '🎾 Tennis Court Available!',
      body: `Joe DiMaggio courts available: ${slotTimes}`,
      data: { availableSlots }
    });
  }
  
  if (messages.length === 0) return;
  
  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    console.log(`Sent ${messages.length} notifications`);
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
}

// Schedule monitoring for Fridays after 5 PM (check every 15 minutes)
cron.schedule('*/15 17-20 * * 5', async () => {
  console.log('Running Friday evening court check...');
  await checkCourtAvailability();
});

// Also check every hour during business hours for testing
cron.schedule('0 9-21 * * *', async () => {
  await checkCourtAvailability();
});

// Routes
app.get('/', (req, res) => {
  res.json({ status: 'Tennis Court Monitor API', uptime: process.uptime() });
});

app.post('/register', (req, res) => {
  const { pushToken } = req.body;
  
  if (!pushToken) {
    return res.status(400).json({ error: 'Push token required' });
  }
  
  const existingUser = db.users.find(u => u.pushToken === pushToken);
  if (existingUser) {
    return res.json({ message: 'Already registered', user: existingUser });
  }
  
  const user = {
    id: Date.now(),
    pushToken,
    notificationsEnabled: true,
    registeredAt: new Date().toISOString()
  };
  
  db.users.push(user);
  saveDB();
  
  res.json({ message: 'Registered successfully', user });
});

app.put('/notifications/:token', (req, res) => {
  const { token } = req.params;
  const { enabled } = req.body;
  
  const user = db.users.find(u => u.pushToken === token);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.notificationsEnabled = enabled;
  saveDB();
  
  res.json({ message: 'Notifications updated', user });
});

app.get('/checks', (req, res) => {
  res.json({
    recentChecks: db.checks.slice(-10).reverse(),
    currentlyAvailable: db.availableCourts
  });
});

app.post('/check-now', async (req, res) => {
  console.log('Manual court check requested');
  const result = await checkCourtAvailability();
  res.json({
    message: 'Check completed',
    result,
    availableSlots: db.availableCourts
  });
});

app.listen(PORT, () => {
  console.log(`Court monitor server running on port ${PORT}`);
  console.log('Monitoring Joe DiMaggio tennis courts on Fridays after 5 PM');
});