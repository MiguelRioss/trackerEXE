# 📦 trackerEXE (CTT Product Tracker)

Remote Node.js application running on a **Raspberry Pi 2** hosted in an external office network and accessed securely through **Tailscale (Tailnet)**.  
The system automates the tracking of **CTT product deliveries**, updating order statuses and handling background processes in real time.

## 🚀 Tech Stack
- **Runtime:** Node.js (ES Modules)
- **Environment:** Raspberry Pi 2 (remote, online 24/7 via Tailscale)
- **Testing:** Mocha / Chai
- **Deployment:** Direct on Pi (systemd service)
- **Networking:** Tailnet secure VPN mesh
- **Tools:** VS Code, Git, CTT API

## 🧩 Features
- Automated CTT tracking and patch updates  
- Remote execution through Tailnet  
- Persistent connection and auto-restart service  
- Structured logging and error handling  
- Modular architecture separating logic and test environments  


## 🧠 Current Focus
- Improve CTT API reliability and rate-limit handling  
- Add notification system for failed deliveries  
- Build remote admin panel for live tracking control  

## 📡 Notes
This project demonstrates remote backend operation on embedded hardware.  
It combines **Node.js automation** with **Tailnet connectivity** to create a lightweight, always-on distributed service.
