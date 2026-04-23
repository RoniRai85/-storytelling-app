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
let reactions = {};
let replies = {};
let askQueue = [];

/* ---------- AUDIENCE APP ---------- */

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
}
.container {
  padding:24px 18px 90px;
  max-width:760px;
  margin:0 auto;
}
h1,h2,h3 { margin-bottom:10px; }
.sub { opacity:.7; margin-bottom:18px; }
.card {
  background:#1a1a1a;
  padding:16px;
  margin:12px 0;
  border-radius:16px;
}
input {
  width:100%;
  padding:14px;
  border-radius:14px;
  border:none;
  font-size:16px;
  box-sizing:border-box;
  margin-top:12px;
}
button {
  padding:11px 18px;
  margin:10px 6px 0 0;
  border:none;
  border-radius:14px;
  background:#ff5c7c;
  color:white;
  font-weight:bold;
  cursor:pointer;
}
button.dark {
  background:#2a2a2a;
}
.tabs {
  position:fixed;
  bottom:0;
  left:0;
  right:0;
  background:#050505;
  display:flex;
  justify-content:space-around;
  padding:10px 6px;
  border-top:1px solid #222;
}
.tabs button {
  background:#1e1e1e;
  font-size:13px;
  padding:10px 12px;
}
.tabs button.active {
  background:#ff5c7c;
}
.tab { display:none; }
.tab.active { display:block; }
.reply {
  margin-left:14px;
  padding:8px 10px;
  background:#252525;
  border-radius:10px;
  margin-top:8px;
  font-size:14px;
}
.small {
  opacity:.65;
  font-size:14px;
}
.highlight {
  border:1px solid #ff5c7c;
  box-shadow:0 0 18px rgba(255,92,124,.25);
}
</style>
</head>

<body>
<div class="container">

<div id="stage" class="tab active">
  <h1>Storytelling: No Names Attached</h1>
  <div class="sub">Scan. Stay anonymous. Keep it short & real.</div>

  <div class="card">
    <h2 id="question">Waiting for question...</h2>
    <input id="answer" placeholder="Type your anonymous answer..." maxlength="220" />
    <button onclick="sendAnswer()">Submit</button>
  </div>

  <div id="highlightBox"></div>
</div>

<div id="wall" class="tab">
  <h2>🧱 The Wall</h2>
  <div class="sub">Browse anonymous answers. React. Reply. Feel seen without being exposed.</div>
  <div id="wallFeed"></div>
</div>

<div id="ask" class="tab">
  <h2>❓ Ask the Room</h2>
  <div class="sub">Ask something anonymously for the host or room to answer.</div>
  <input id="askInput" placeholder="Ask the room..." maxlength="220" />
  <button onclick="sendQuestion()">Submit Question</button>
  <div id="askList"></div>
</div>

</div>

<div class="tabs">
  <button id="tab-stage" class="active" onclick="showTab('stage')">Stage</button>
  <button id="tab-wall" onclick="showTab('wall')">Wall</button>
  <button id="tab-ask" onclick="showTab('ask')">Ask</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();

let responses = [];
let reactions = {};
let replies = {};
let askQueue = {};
let votedIds = {};

socket.emit("join");

socket.on("state", state => {
  document.getElementById("question").innerText = state.question || "Waiting for question...";
  responses = state.responses || [];
  reactions = state.reactions || {};
  replies = state.replies || {};
  askQueue = state.askQueue || [];
  renderWall();
  renderAsk();
});

socket.on("question", q => {
  document.getElementById("question").innerText = q || "Waiting for question...";
  document.getElementById("highlightBox").innerHTML = "";
});

socket.on("new-response", data => {
  responses.unshift(data);
  renderWall();
});

socket.on("highlight", data => {
  const disabled = votedIds[data.id] ? "disabled" : "";
  const buttonText = votedIds[data.id] ? "Voted ❤️" : "Vote ❤️";

  document.getElementById("highlightBox").innerHTML = \`
    <div class="card highlight">
      <h3>🔥 Host Highlight</h3>
      <p>\${escapeHtml(data.text)}</p>
      <button \${disabled} onclick="vote('\${data.id}')">\${buttonText}</button>
    </div>
  \`;
});

socket.on("reactions", data => {
  reactions = data;
  renderWall();
});

socket.on("replies", data => {
  replies = data;
  renderWall();
});

socket.on("askQueue", data => {
  askQueue = data;
  renderAsk();
});

function showTab(tab){
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(el => el.classList.remove("active"));
  document.getElementById(tab).classList.add("active");
  document.getElementById("tab-" + tab).classList.add("active");
}

function sendAnswer(){
  const input = document.getElementById("answer");
  const val = input.value.trim();
  if(!val) return;
  socket.emit("answer", val);
  input.value = "";
  showTab("wall");
}

function react(id, type){
  socket.emit("react", { id, type });
}

function reply(id){
  const text = prompt("Reply anonymously:");
  if(text && text.trim()){
    socket.emit("reply", { parentId:id, text:text.trim() });
  }
}

function vote(id){
  if(votedIds[id]) return;
  votedIds[id] = true;
  socket.emit("vote", id);
}

function sendQuestion(){
  const input = document.getElementById("askInput");
  const val = input.value.trim();
  if(!val) return;
  socket.emit("ask-question", val);
  input.value = "";
}

function renderWall(){
  const feed = document.getElementById("wallFeed");

  if(!responses.length){
    feed.innerHTML = '<div class="card small">No answers yet. Be the brave first anonymous legend.</div>';
    return;
  }

  feed.innerHTML = responses.map(r => {
    const reactData = reactions[r.id] || {};
    const replyData = replies[r.id] || [];

    return \`
      <div class="card">
        <p>\${escapeHtml(r.text)}</p>
        <button class="dark" onclick="react('\${r.id}','same')">Same \${reactData.same || 0}</button>
        <button class="dark" onclick="react('\${r.id}','laugh')">😂 \${reactData.laugh || 0}</button>
        <button class="dark" onclick="react('\${r.id}','heart')">❤️ \${reactData.heart || 0}</button>
        <button onclick="reply('\${r.id}')">Reply</button>

        <div>
          \${replyData.map(rep => '<div class="reply">↳ ' + escapeHtml(rep) + '</div>').join("")}
        </div>
      </div>
    \`;
  }).join("");
}

function renderAsk(){
  const list = document.getElementById("askList");

  if(!askQueue.length){
    list.innerHTML = '<div class="card small">No anonymous questions yet.</div>';
    return;
  }

  list.innerHTML = askQueue.map((q, i) => \`
    <div class="card">
      <strong>Question \${i + 1}</strong>
      <p>\${escapeHtml(q.text || q)}</p>
    </div>
  \`).join("");
}

function escapeHtml(str) {
  return String(str || "")
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

/* ---------- HOST APP ---------- */

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
  box-sizing:border-box;
}
.right {
  width:40%;
  padding:30px;
  background:#111;
  box-sizing:border-box;
}
input {
  padding:12px;
  width:100%;
  max-width:700px;
  border-radius:12px;
  border:none;
  font-size:16px;
  box-sizing:border-box;
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
.card {
  background:#1a1a1a;
  padding:12px;
  margin:8px 0;
  border-radius:12px;
  cursor:pointer;
}
.card:hover {
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
  margin:16px 0 24px;
  padding:12px;
  border-radius:10px;
  background:#171717;
  word-break:break-all;
}
@media(max-width:900px){
  .container { display:block; }
  .left,.right { width:100%; }
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

  <h3>Live Answers <span id="count" class="small">0</span></h3>
  <div class="small">Tap an answer to highlight it for the audience.</div>
  <div id="responses"></div>
</div>

<div class="right">
  <h3>AI Summary</h3>
  <pre id="summary">Nothing yet.</pre>

  <h3>Top Votes</h3>
  <div id="votes">No votes yet.</div>

  <h3>Audience Questions</h3>
  <div class="small">Tap a question to send it to Stage.</div>
  <div id="askQueue">No questions yet.</div>
</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let responses = [];
let askQueue = [];

document.getElementById("joinLink").innerText = window.location.origin;
socket.emit("join");

socket.on("state", state => {
  responses = state.responses || [];
  askQueue = state.askQueue || [];
  renderResponses();
  renderAskQueue();
});

socket.on("new-response", data => {
  responses.unshift(data);
  renderResponses();
});

socket.on("question", q => {
  responses = [];
  document.getElementById("summary").innerText = "Nothing yet.";
  document.getElementById("votes").innerText = "No votes yet.";
  renderResponses();
});

socket.on("summary", s => {
  document.getElementById("summary").innerText = s;
});

socket.on("votes", data => {
  const entries = Object.entries(data).sort((a,b) => b[1] - a[1]);
  const box = document.getElementById("votes");

  if(!entries.length){
    box.innerText = "No votes yet.";
    return;
  }

  box.innerHTML = entries.map(([text,count]) => \`
    <div class="card"><strong>\${count} ❤️</strong> — \${escapeHtml(text)}</div>
  \`).join("");
});

socket.on("askQueue", data => {
  askQueue = data;
  renderAskQueue();
});

function ask(){
  const input = document.getElementById("q");
  const q = input.value.trim();
  if(!q) return;
  socket.emit("new-question", q);
}

function summarize(){
  socket.emit("summarize");
}

function renderResponses(){
  document.getElementById("count").innerText = responses.length;
  const box = document.getElementById("responses");

  if(!responses.length){
    box.innerHTML = '<div class="card small">No answers yet.</div>';
    return;
  }

  box.innerHTML = responses.map(r => \`
    <div class="card" onclick="highlight('\${r.id}')">\${escapeHtml(r.text)}</div>
  \`).join("");
}

function highlight(id){
  const item = responses.find(r => r.id === id);
  if(item) socket.emit("highlight", item);
}

function renderAskQueue(){
  const box = document.getElementById("askQueue");

  if(!askQueue.length){
    box.innerHTML = '<div class="card small">No audience questions yet.</div>';
    return;
  }

  box.innerHTML = askQueue.map((q, i) => \`
    <div class="card" onclick="pushQuestion(\${i})">
      <strong>Q\${i + 1}</strong>
      <p>\${escapeHtml(q.text)}</p>
    </div>
  \`).join("");
}

function pushQuestion(index){
  const q = askQueue[index];
  if(q && q.text){
    socket.emit("new-question", q.text);
  }
}

function escapeHtml(str) {
  return String(str || "")
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

/* ---------- SOCKET LOGIC ---------- */

io.on("connection", (socket) => {
  socket.on("join", () => {
    socket.emit("state", {
      question: currentQuestion,
      responses,
      highlighted,
      votes,
      reactions,
      replies,
      askQueue
    });

    if (currentQuestion) socket.emit("question", currentQuestion);
    if (highlighted) socket.emit("highlight", highlighted);
  });

  socket.on("answer", (text) => {
    const cleanText = String(text || "").trim().slice(0, 220);
    if (!cleanText) return;

    const obj = {
      id: Math.random().toString(36).substring(2, 10),
      text: cleanText,
      createdAt: Date.now()
    };

    responses.unshift(obj);
    io.emit("new-response", obj);
  });

  socket.on("new-question", (q) => {
    currentQuestion = String(q || "").trim().slice(0, 280);
    responses = [];
    highlighted = null;
    votes = {};
    reactions = {};
    replies = {};

    io.emit("question", currentQuestion);
    io.emit("votes", votes);
    io.emit("reactions", reactions);
    io.emit("replies", replies);
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

  socket.on("react", ({ id, type }) => {
    if (!id || !type) return;

    if (!reactions[id]) reactions[id] = {};
    reactions[id][type] = (reactions[id][type] || 0) + 1;

    io.emit("reactions", reactions);
  });

  socket.on("reply", ({ parentId, text }) => {
    const cleanText = String(text || "").trim().slice(0, 180);
    if (!parentId || !cleanText) return;

    if (!replies[parentId]) replies[parentId] = [];
    replies[parentId].push(cleanText);

    io.emit("replies", replies);
  });

  socket.on("ask-question", (text) => {
    const cleanText = String(text || "").trim().slice(0, 220);
    if (!cleanText) return;

    askQueue.unshift({
      id: Math.random().toString(36).substring(2, 10),
      text: cleanText,
      createdAt: Date.now()
    });

    io.emit("askQueue", askQueue);
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
You are helping a live host run a witty anonymous storytelling event.

Take the audience answers below and produce:
1. A catchy title
2. 3 short themes
3. A brief, witty host insight in 2-4 lines

Keep it warm, clever, socially observant, and NOT clinical.

Answers:
${responses.map(r => "- " + r.text).join("\\n")}
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
  console.log("No Names Attached running on port " + PORT);
});
