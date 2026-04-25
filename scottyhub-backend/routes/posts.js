const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/posts — get all posts (feed)
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'username avatar');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/posts — create post
router.post('/', protect, async (req, res) => {
  try {
    const { content, mediaUrl } = req.body;
    if (!content) return res.status(400).json({ message: 'Content is required' });
    const post = await Post.create({ author: req.user._id, content, mediaUrl });
    await post.populate('author', 'username avatar');
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/posts/:id/like — toggle like
router.put('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const liked = post.likes.includes(req.user._id);
    if (liked) post.likes.pull(req.user._id);
    else post.likes.push(req.user._id);
    await post.save();
    res.json({ likes: post.likes.length, liked: !liked });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/posts/:id/comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.comments.push({ author: req.user._id, text });
    await post.save();
    await post.populate('comments.author', 'username avatar');
    res.json(post.comments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not allowed' });
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
