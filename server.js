require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

// In-memory store (replace with SQLite for production)
const posts = {};

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// Social media API tokens
const socialMediaTokens = {
  facebook: process.env.FACEBOOK_TOKEN,
  instagram: process.env.INSTAGRAM_TOKEN,
  twitter: process.env.TWITTER_TOKEN
};

// Submit content
app.post('/submit-content', async (req, res) => {
  const { content, email } = req.body;
  const postId = uuidv4();

  try {
    // Store post
    posts[postId] = { content, email, status: 'pending_content' };

    // Send confirmation email
    const confirmUrl = `${process.env.APP_URL}/confirm-content/${postId}`;
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Confirm Post Content',
      html: `<p>Review the content:</p><p>${content}</p><p><a href="${confirmUrl}">Approve</a></p>`
    };
    await transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email error:', error);
      } else {
        console.log('Email sent:', info.response);
      }
    });

    res.json({ message: 'Content submitted. Check your email for confirmation.', postId });
  } catch (error) {
    console.log('Error processing content:', error);
    res.status(500).json({ message: 'Error processing content: ' + error.message });
  }
});

// Resend email
app.post('/resend-email/:postId', async (req, res) => {
  const postId = req.params.postId;
  if (!posts[postId]) {
    return res.status(404).json({ message: 'Post not found' });
  }
  try {
    const confirmUrl = `${process.env.APP_URL}/confirm-content/${postId}`;
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: posts[postId].email,
      subject: 'Confirm Post Content',
      html: `<p>Review the content:</p><p>${posts[postId].content}</p><p><a href="${confirmUrl}">Approve</a></p>`
    };
    await transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email error:', error);
      } else {
        console.log('Email sent:', info.response);
      }
    });
    res.json({ message: 'Confirmation email resent. Check your email.' });
  } catch (error) {
    console.log('Error resending email:', error);
    res.status(500).json({ message: 'Error resending email: ' + error.message });
  }
});

// Confirm content
app.get('/confirm-content/:postId', async (req, res) => {
  const postId = req.params.postId;
  if (!posts[postId]) {
    return res.status(404).json({ message: 'Post not found' });
  }
  posts[postId].status = 'content_confirmed';
  res.send(`
    <script>
      window.location.href = '${process.env.APP_URL}?form=imageForm&postId=${postId}';
    </script>
  `);
});

// Submit image
app.post('/submit-image', upload.single('image'), async (req, res) => {
  const postId = req.body.postId;
  if (!posts[postId]) {
    return res.status(404).json({ message: 'Post not found' });
  }
  let imageUrl = '';
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`; // Note: Use cloud storage for production
  } else {
    return res.status(400).json({ message: 'Image upload required' });
  }
  posts[postId].imageUrl = imageUrl;
  posts[postId].status = 'pending_final';

  // Send final confirmation email
  const confirmUrl = `${process.env.APP_URL}/confirm-final/${postId}`;
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: posts[postId].email,
    subject: 'Confirm Final Post',
    html: `<p>Review the final post:</p><p>Content: ${posts[postId].content}</p><p>Image: <img src="${process.env.APP_URL}${imageUrl}" width="200"></p><p><a href="${confirmUrl}">Approve</a></p>`
  };
  await transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Email error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });

  res.json({ message: 'Image submitted. Check your email for final confirmation.' });
});

// Confirm final post
app.get('/confirm-final/:postId', async (req, res) => {
  const postId = req.params.postId;
  if (!posts[postId]) {
    return res.status(404).json({ message: 'Post not found' });
  }
  posts[postId].status = 'final_confirmed';
  res.send(`
    <script>
      window.location.href = '${process.env.APP_URL}?form=platformForm&postId=${postId}';
    </script>
  `);
});

// Submit platforms and post
app.post('/submit-platforms', async (req, res) => {
  const { postId, platforms } = req.body;
  if (!posts[postId]) {
    return res.status(404).json({ message: 'Post not found' });
  }
  const post = posts[postId];
  try {
    for (const platform of platforms) {
      if (platform === 'facebook') {
        await axios.post('https://graph.facebook.com/v12.0/me/feed', {
          message: post.content,
          link: `${process.env.APP_URL}${post.imageUrl}`,
          access_token: socialMediaTokens.facebook
        });
      } else if (platform === 'instagram') {
        await axios.post('https://graph.instagram.com/v12.0/me/media', {
          image_url: `${process.env.APP_URL}${post.imageUrl}`,
          caption: post.content,
          access_token: socialMediaTokens.instagram
        });
      } else if (platform === 'twitter') {
        await axios.post('https://api.twitter.com/2/tweets', {
          text: post.content + (post.imageUrl ? ` ${process.env.APP_URL}${post.imageUrl}` : '')
        }, {
          headers: { Authorization: `Bearer ${socialMediaTokens.twitter}` }
        });
      }
    }
    posts[postId].status = 'posted';
    res.json({ message: 'Post published successfully!' });
  } catch (error) {
    console.log('Error posting:', error);
    res.status(500).json({ message: 'Error posting: ' + error.message });
  }
});

// Handle form redirects
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`Server running at ${process.env.APP_URL}`);
});
