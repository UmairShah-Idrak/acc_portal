require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: 'admin@idrakai.com' });
  if (existing) {
    console.log('Admin already exists:', existing.email);
    process.exit(0);
  }

  const admin = await User.create({
    name: 'Admin',
    email: 'admin@idrakai.com',
    password: 'admin123',
    role: 'admin',
    isActive: true,
  });

  console.log('Admin user created:');
  console.log('  Email:    admin@idrakai.com');
  console.log('  Password: admin123');
  console.log('  ⚠️  Change the password after first login!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
