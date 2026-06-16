# AdCash Instream Ads Tester

A complete, easy-to-use testing environment for **AdCash** video (instream) advertisements. Test pre-roll, mid-roll, and post-roll ads directly in a video player with full debug logging and controls.

<img width="1835" height="2005" alt="image" src="https://github.com/user-attachments/assets/ac7f6e93-ec8e-4e38-b650-5a926ed2fd0d" />

## ✨ Features

- **Multiple Ad Types**: Instream (Pre-roll), Midstream, Post-stream
- **Zone ID Testing**: Test any AdCash Zone ID you provide
- **VAST URL Support**: Direct VAST testing with waterfall fallback
- **Video Player**: Built-in video player with HLS support (`hls.js`)
- **Full Test Sequence**: One-click test of complete ad → main video flow
- **Real-time Logs**: Detailed debug console with timestamps and status icons
- **Ad Controls**: Skip ad, mute/unmute, fullscreen, progress tracking
- **Error Handling**: Robust VAST parsing, redirect following, and playback recovery
- **Mobile Friendly**: Works on desktop and mobile browsers

## 🎯 How It Works

1. Enter your **AdCash Zone ID**
2. Choose ad type (Instream / Midstream / Poststream)
3. (Optional) Provide a custom VAST URL
4. Click **"Load & Play Ad"** to test the ad
5. Use **"Test Full Sequence"** to test ad + main video flow

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)

1. Fork or clone this repository
2. Go to **Settings → Pages**
3. Set source to `main` branch → Save
4. Your tester will be live at: `https://adcash-testing-site.vercel.app`

### Option 2: Local Development

```bash
# Clone the repo
git clone https://github.com/Usman1subhani/Ads-Testing-Site.git

# Open index.html in your browser

