const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3000;

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
    user: 'tanishqagarwal595@gmail.com', // Replace with your Gmail
    pass: 'vsfv eecd ifmn pwqb' // Replace with Gmail App Password
  }
});

// Social media API tokens (replace with your tokens)
const socialMediaTokens = {
  facebook: 'your-facebook-access-token',
  instagram: 'your-instagram-access-token',
  twitter: 'your-twitter-api-key' // Includes API Key, Secret, Access Token, etc.
};

// Submit content
app.post('/submit-content', async (req, res) => {
  const { content, rephrase, email } = req.body;
  const postId = uuidv4();
  let finalContent = content;

  try {
    // Rephrase if requested
    if (rephrase === 'yes') {
      const response = await axios.post('https://api-inference.huggingface.co/models/gpt2', {
        inputs: `Rephrase: ${content}`
      }, {
        headers: { Authorization: 'Bearer your-huggingface-api-key' }
      });
      finalContent = response.data[0].generated_text.replace('Rephrase: ', '').trim();
    }

    // Store post
    posts[postId] = { content: finalContent, email, status: 'pending_content' };

    // Send confirmation email
    const confirmUrl = `https://social-media-automation-swart.vercel.app/confirm-content/${postId}`;
    const mailOptions = {
      from: 'tanishqagarwal595@gmail.com',
      to: email,
      subject: 'Confirm Post Content',
      html: `<p>Review the content:</p><p>${finalContent}</p><p><a href="${confirmUrl}">Approve</a></p>`
    };
    await transporter.sendMail(mailOptions);

    res.json({ message: 'Content submitted. Check your email for confirmation.', postId });
  } catch (error) {
    res.status(500).json({ message: 'Error processing content: ' + error.message });
  }
});

// Confirm content
app.get('/confirm-content/:postId', async (req, res) => {
  const postId = req.params.postId;
  if (!posts[postId]) {
    return res.status(404).send('Post not found');
  }

  posts[postId].status = 'content_confirmed';
  res.send(`
    <script>
      window.location.href = 'https://social-media-automation-swart.vercel.app/?form=imageForm&postId=${postId}';
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
  if (req.body.imageChoice === 'upload' && req.file) {
    imageUrl = `/uploads/${req.file.filename}`; // In production, use cloud storage
  } else if (req.body.imageChoice === 'generate') {
    try {
      const response = await axios.post('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2', {
        inputs: req.body.imagePrompt || posts[postId].content.slice(0, 50)
      }, {
        headers: { Authorization: 'Bearer your-huggingface-api-key' }
      });
      imageUrl = response.data.image_url || 'https://via.placeholder.com/300'; // Adjust based on API
    } catch (error) {
      return res.status(500).json({ message: 'Error generating image: ' + error.message });
    }
  }

  posts[postId].imageUrl = imageUrl;
  posts[postId].status = 'pending_final';

  // Send final confirmation email
  const confirmUrl = `https://social-media-automation-swart.vercel.app/confirm-final/${postId}`;
  const mailOptions = {
    from: 'tanishqagarwal595@gmail.com',
    to: posts[postId].email,
    subject: 'Confirm Final Post',
    html: `<p>Review the final post:</p><p>Content: ${posts[postId].content}</p><p>Image: <img src="${imageUrl}" width="200"></p><p><a href="${confirmUrl}">Approve</a></p>`
  };
  await transporter.sendMail(mailOptions);

  res.json({ message: 'Image submitted. Check your email for final confirmation.' });
});

// Confirm final post
app.get('/confirm-final/:postId', async (req, res) => {
  const postId = req.params.postId;
  if (!posts[postId]) {
    return res.status(404).send('Post not found');
  }

  posts[postId].status = 'final_confirmed';
  res.send(`
    <script>
      window.location.href = 'https://social-media-automation-swart.vercel.app?form=platformForm&postId=${postId}';
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
          link: post.imageUrl,
          access_token: socialMediaTokens.facebook
        });
      } else if (platform === 'instagram') {
        await axios.post('https://graph.instagram.com/v12.0/me/media', {
          image_url: post.imageUrl,
          caption: post.content,
          access_token: socialMediaTokens.instagram
        });
      } else if (platform === 'twitter') {
        await axios.post('https://api.twitter.com/2/tweets', {
          text: post.content + (post.imageUrl ? ` ${post.imageUrl}` : '')
        }, {
          headers: { Authorization: `Bearer ${socialMediaTokens.twitter}` }
        });
      }
    }

    posts[postId].status = 'posted';
    res.json({ message: 'Post published successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Error posting: ' + error.message });
  }
});

// Handle form redirects
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Start server
app.listen(port, () => {
  console.log(`Server running at https://social-media-automation-swart.vercel.app/`);
});
