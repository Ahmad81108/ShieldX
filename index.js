const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json({ limit: "256kb" }));

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

const serviceAccount = getServiceAccount();
if (!serviceAccount) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT");
}

// 🔴 ONLY THIS PART IS UPDATED (no other functions touched)
const firebaseConfig = {
  credential: serviceAccount
    ? admin.credential.cert(serviceAccount)
    : admin.credential.applicationDefault(),
};

if (process.env.FIREBASE_DATABASE_URL) {
  firebaseConfig.databaseURL = process.env.FIREBASE_DATABASE_URL;
}

admin.initializeApp(firebaseConfig);
// 🔴 END OF UPDATE

async function verifyAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.substring("Bearer ".length);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

app.post("/notify", async (req, res) => {
  const decoded = await verifyAuth(req);
  if (!decoded) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const {
    recipientToken,
    title,
    message,
    senderId,
    senderName,
    senderImage,
    chatId,
    messageId,
  } = req.body || {};

  if (!recipientToken || !message || !senderId || !chatId || !messageId) {
    return res.status(400).json({ error: "missing fields" });
  }

  if (decoded.uid !== senderId) {
    return res.status(403).json({ error: "sender mismatch" });
  }

  const payload = {
    token: recipientToken,
    notification: {
      title: title || "New Message",
      body: message,
    },
    data: {
      title: title || "New Message",
      body: message,
      senderId: senderId,
      senderName: senderName || "",
      senderImage: senderImage || "",
      chatId: chatId,
      messageId: messageId,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "shieldx_messages",
        sound: "default",
      },
    },
  };

  try {
    await admin.messaging().send(payload);
    await admin.database().ref(`Chats/${chatId}/${messageId}`).update({
      delivered: true,
      deliveredAt: admin.database.ServerValue.TIMESTAMP,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("Send failed", e);
    return res.status(500).json({ error: "send failed" });
  }
});

app.get("/", (req, res) => {
  res.send("ShieldX notify server OK");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Notify server listening on ${port}`);
});
