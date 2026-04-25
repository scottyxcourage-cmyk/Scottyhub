const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/users/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

// PUT /api/users/me
router.put('/me', protect, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (username) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    await user.save();
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users — admin only
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password -otp');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id — admin only
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
