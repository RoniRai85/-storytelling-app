// ADDITIONS: multi-zone app (Stage, Wall, Ask, Replies)

let askQueue = [];
let reactions = {};
let replies = {};

io.on("connection", (socket) => {

  socket.on("join", () => {
    socket.emit("state", {
      question: currentQuestion,
      responses,
      askQueue,
      reactions,
      replies
    });
  });

  socket.on("answer", (text) => {
    const obj = {
      id: Math.random().toString(36).substring(7),
      text
    };

    responses.push(obj);
    io.emit("new-response", obj);
  });

  socket.on("react", ({ id, type }) => {
    if (!reactions[id]) reactions[id] = {};
    reactions[id][type] = (reactions[id][type] || 0) + 1;
    io.emit("reactions", reactions);
  });

  socket.on("reply", ({ parentId, text }) => {
    if (!replies[parentId]) replies[parentId] = [];
    replies[parentId].push(text);
    io.emit("replies", replies);
  });

  socket.on("ask-question", (text) => {
    askQueue.push(text);
    io.emit("askQueue", askQueue);
  });

  socket.on("new-question", (q) => {
    currentQuestion = q;
    responses = [];
    reactions = {};
    replies = {};
    io.emit("question", q);
  });

});
