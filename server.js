const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let currentQuestion = "";
let responses = [];
let highlighted = null;
let votes = {};

/* ---------- FRONTEND ---------- */

const audienceHTML = `
<!DOCTYPE html>
<html>
<head>
<title>No Names Attached</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body {
  margin:0;
  font-family: Arial, sans-serif;
  background:#0f0f0f;
  color:white;
  text-align:center;
}
.container {
  padding:32px 20px;
  max-width: 700px;
  margin: 0 auto;
}
h1 {
  font-size:28px;
  line-height: 1.25;
}
.sub {
  opacity:.7;
  margin-bottom: 24px;
}
input {
  padding:14px;
  width:100%;
  max-width:520px;
  border-radius:12px;
  border:none;
  margin-top:20px;
  font-size:16px;
  box-sizing: border-box;
}
button {
  margin-top:15px;
  padding:12px 25px;
  border:none;
  border-radius:12px;
  background:#ff5c7c;
  color:white;
  font-weight:bold;
  font-size:16px;
}
button:disabled {
  opacity:.5;
}
.highlight {
  background:#1b1b1b;
  padding:20px;
  border-radius:16px;
  margin-top:30px;
  text-align:left;
}
.vote {
  margin-top:10px;
}
.note {
  margin-top:20px;
  opacity:.65;
  font-size:14px;
}
</style>
</head>

<body>
<div class="container">

<h1 id="question">Waiting for question...</h1>
<div class="sub">Anonymous answers only</div>

<input id="answer" placeholder="Type your anonymous answer..." maxlength="220" />
<br>
<button id="submitBtn" onclick="send()">Submit</button>

<div id="highlightBox"></div>
<div class="note">You can stay anonymous. Keep it short, human, and real.</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let votedIds = {};

socket.emit("join");

socket.on("question", q => {
  document.getElementById("question").innerText = q || "Waiting for question...";
  document.getElementById("highlightBox").innerHTML = "";
});

socket.on("highlight", data => {
  const disabled = votedIds[data.id] ? "disabled" : "";
  const buttonText = votedIds[data.id] ? "Voted ❤️" : "Vote ❤️";

  const box = document.getElementById("highlightBox");
  box.innerHTML = \`
    <div class="highlight">
      <h3>🔥 Highlight</h3>
      <p>\${escapeHtml(data.text)}</p>
      <button \${disabled} onclick="vote('\${data.id}')">\${buttonText}</button>
    </div>
  \`;
});

function send() {
  const input = document.getElementById("answer");
  const btn = document.getElementById("submitBtn");
  const val = input.value.trim();
  if(!val) return;

  btn.disabled = true;
  socket.emit("answer", val);
  input.value = "";

  setTimeout(() => {
    btn.disabled = false;
  }, 800);
}

function vote(id){
  if (votedIds[id]) return;
  votedIds[id] = true;
  socket.emit("vote", id);
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
</script>

</body>
</html>
`;

const hostHTML = `
<!DOCTYPE html>
<html>
<head>
<title>Host Panel</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body {
  margin:0;
  font-family: Arial, sans-serif;
  background:#050505;
  color:white;
}
.container {
  display:flex;
  min-height:100vh;
}
.left {
  width:60%;
  padding:30px;
  box-sizing: border-box;
}
.right {
  width:40%;
  padding:30px;
  background:#111;
  box-sizing: border-box;
}
input, textarea {
  padding:12px;
  width:100%;
  max-width:700px;
  border-radius:12px;
  border:none;
  box-sizing: border-box;
  font-size:16px;
}
textarea {
  min-height:80px;
  resize:vertical;
}
button {
  padding:10px 18px;
  margin:10px 10px 10px 0;
  border:none;
  border-radius:10px;
  background:#00c9a7;
  color:black;
  font-weight:bold;
  cursor:pointer;
}
button.secondary {
  background:#ff5c7c;
  color:white;
}
.response {
  background:#1a1a1a;
  padding:12px;
  margin:8px 0;
  border-radius:10px;
  cursor:pointer;
  transition: .15s ease;
}
.response:hover {
  background:#242424;
}
pre {
  white-space: pre-wrap;
  line-height:1.45;
}
.small {
  opacity:.65;
  font-size:14px;
}
.linkBox {
  margin: 16px 0 24px;
  padding: 12px;
  border-radius: 10px;
  background: #171717;
  word-break: break-all;
}
.count {
  opacity:.7;
  margin-left:8px;
}
@media (max-width: 900px) {
  .container {
    display:block;
  }
  .left, .right {
    width:100%;
  }
}
</style>
</head>

<body>
<div class="container">

<div class="left">
  <h2>Host Control</h2>

  <div class="small">Audience link</div>
  <div class="linkBox" id="joinLink"></div>

  <input id="q" placeholder="Ask a question..." />
  <div>
    <button onclick="ask()">Ask</button>
    <button class="secondary" onclick="summarize()">AI Summary</button>
  </div>

  <h3>Responses <span class="count" id="responseCount">0</span></h3>
  <div class="small">Tap any response to highlight it on the audience screen.</div>
  <div id="responses"></div>
</div>

<div class="right">
  <h3>AI Summary</h3>
  <pre id="summary">Nothing yet.</pre>

  <h3>Top Votes</h3>
  <div id="votes">No votes yet.</div>
</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();

document.getElementById("joinLink").innerText = window.location.origin;

socket.on("response", data => {
  const div = document.createElement("div");
  div.className = "response";
  div.innerText = data.text;
  div.onclick = () => {
    socket.emit("highlight", data);
  };
  document.getElementById("responses").prepend(div);
  updateCount();
});

socket.on("question", q => {
  document.getElementById("responses").innerHTML = "";
  document.getElementById("summary").innerText = "Nothing yet.";
  document.getElementById("votes").innerText = "No votes yet.";
  updateCount();
});

socket.on("summary", s => {
  document.getElementById("summary").innerText = s;
});

socket.on("votes", data => {
  const container = document.getElementById("votes");
  const entries = Object.entries(data).sort((a,b) => b[1] - a[1]);

  if (!entries.length) {
    container.innerText = "No votes yet.";
    return;
  }

  container.innerHTML = entries
    .map(([text, count]) => '<div style="margin-bottom:10px;"><strong>' + count + ' ❤️</strong> — ' + escapeHtml(text) + '</div>')
    .join("");
});

function ask(){
  const q = document.getElementById("q").value.trim();
  if (!q) return;
  socket.emit("new-question", q);
}

function summarize(){
  socket.emit("summarize");
}

function updateCount() {
  document.getElementById("responseCount").innerText =
    document.querySelectorAll("#responses .response").length;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
</script>

</body>
</html>
`;

/* ---------- ROUTES ---------- */

app.get("/", (req, res) => res.send(audienceHTML));
app.get("/host", (req, res) => res.send(hostHTML));

/* ---------- SOCKET ---------- */

io.on("connection", (socket) => {
  socket.on("join", () => {
    socket.emit("question", currentQuestion);
    if (highlighted) {
      socket.emit("highlight", highlighted);
    }
  });

  socket.on("answer", (text) => {
    const cleanText = String(text || "").trim().slice(0, 220);
    if (!cleanText) return;

    const obj = {
      id: Math.random().toString(36).substring(2, 10),
      text: cleanText
    };

    responses.push(obj);
    io.emit("response", obj);
  });

  socket.on("new-question", (q) => {
    currentQuestion = String(q || "").trim().slice(0, 280);
    responses = [];
    votes = {};
    highlighted = null;
    io.emit("question", currentQuestion);
  });

  socket.on("highlight", (data) => {
    highlighted = data;
    io.emit("highlight", data);
  });

  socket.on("vote", (id) => {
    const found = responses.find(r => r.id === id);
    if (!found) return;

    votes[found.text] = (votes[found.text] || 0) + 1;
    io.emit("votes", votes);
  });

  socket.on("summarize", async () => {
    try {
      if (!responses.length) {
        io.emit("summary", "No responses yet.");
        return;
      }

      const completion = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: `
You are helping a live host run a witty, anonymous storytelling event.

Take the audience answers below and produce:
1. A catchy title
2. 3 short themes
3. A brief, witty host insight in 2-4 lines

Keep it warm, clever, and socially observant.
Do not sound clinical.

Answers:
${responses.map(r => "- " + r.text).join("\n")}
`
      });

      io.emit("summary", completion.output_text);
    } catch (e) {
      console.error(e);
      io.emit("summary", "AI summary failed. Check API key / deployment settings.");
    }
  });
});

/* ---------- START ---------- */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
