const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://yuva-manthan-backend.vercel.app'],
    credentials: true
  }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://yuvamanthan:9315264682@cluster0.7imkzpd.mongodb.net/crowdsolve', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB is connected');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Problem Schema
const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  image: { type: String },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['open', 'solved'], default: 'open' }
});

// Solution Schema
const solutionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

// Comment Schema
const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  solutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solution', required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Problem = mongoose.model('Problem', problemSchema);
const Solution = mongoose.model('Solution', solutionSchema);
const Comment = mongoose.model('Comment', commentSchema);

// Multer configuration for image uploads (temporary storage for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'crowdsolve',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    ).end(file.buffer);
  });
};

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    message: 'Backend is running successfully!', 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Problem routes
app.get('/api/problems', async (req, res) => {
  try {
    const problems = await Problem.find()
      .populate('postedBy', 'username')
      .sort({ createdAt: -1 });
    res.json(problems);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/problems', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, description, location } = req.body;
    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (req.file) {
      const cloudinaryResult = await uploadToCloudinary(req.file);
      imageUrl = cloudinaryResult.secure_url;
    }

    const problem = new Problem({
      title,
      description,
      location,
      image: imageUrl,
      postedBy: req.user.userId
    });

    await problem.save();
    await problem.populate('postedBy', 'username');

    res.status(201).json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single problem
app.get('/api/problems/:id', async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id)
      .populate('postedBy', 'username');
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    
    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update problem
app.put('/api/problems/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, description, location } = req.body;
    const problem = await Problem.findById(req.params.id);

    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Check if user owns the problem
    if (problem.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to edit this problem' });
    }

    // Update fields
    problem.title = title || problem.title;
    problem.description = description || problem.description;
    problem.location = location || problem.location;

    // Handle image update
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (problem.image) {
        try {
          const publicId = problem.image.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`crowdsolve/${publicId}`);
        } catch (error) {
          console.error('Error deleting old image from Cloudinary:', error);
        }
      }
      
      // Upload new image to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(req.file);
      problem.image = cloudinaryResult.secure_url;
    }

    await problem.save();
    await problem.populate('postedBy', 'username');

    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete problem
app.delete('/api/problems/:id', authenticateToken, async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id);

    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Check if user owns the problem
    if (problem.postedBy.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this problem' });
    }

    // Delete associated image from Cloudinary if exists
    if (problem.image) {
      try {
        const publicId = problem.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`crowdsolve/${publicId}`);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
      }
    }

    // Delete problem
    await Problem.findByIdAndDelete(req.params.id);

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Solution routes
app.get('/api/problems/:id/solutions', async (req, res) => {
  try {
    const solutions = await Solution.find({ problemId: req.params.id })
      .populate('postedBy', 'username')
      .sort({ createdAt: -1 });
    res.json(solutions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/problems/:id/solutions', authenticateToken, async (req, res) => {
  try {
    const { description } = req.body;

    const solution = new Solution({
      description,
      problemId: req.params.id,
      postedBy: req.user.userId
    });

    await solution.save();
    await solution.populate('postedBy', 'username');

    res.status(201).json(solution);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upvote solution
app.post('/api/solutions/:id/upvote', authenticateToken, async (req, res) => {
  try {
    const solution = await Solution.findById(req.params.id);
    if (!solution) {
      return res.status(404).json({ message: 'Solution not found' });
    }

    const userId = req.user.userId;
    const upvoteIndex = solution.upvotes.indexOf(userId);

    if (upvoteIndex > -1) {
      // Remove upvote
      solution.upvotes.splice(upvoteIndex, 1);
    } else {
      // Add upvote
      solution.upvotes.push(userId);
    }

    await solution.save();
    res.json({ upvotes: solution.upvotes.length, hasUpvoted: upvoteIndex === -1 });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Comment routes
app.get('/api/solutions/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ solutionId: req.params.id })
      .populate('postedBy', 'username')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/solutions/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;

    const comment = new Comment({
      text,
      solutionId: req.params.id,
      postedBy: req.user.userId
    });

    await comment.save();
    await comment.populate('postedBy', 'username');

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
