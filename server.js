const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const Engine = require("./engine");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function text(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function file(response, relativePath) {
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    text(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      text(response, 404, "Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(buffer);
  });
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("İstek gövdesi çok büyük."));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON gövdesi okunamadı."));
      }
    });
    request.on("error", reject);
  });
}

function createToken() {
  return crypto.randomBytes(16).toString("hex");
}

function createRoomId() {
  let roomId = "";
  do {
    roomId = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

function getOrigin(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${request.headers.host}`;
}

function getRoom(roomId) {
  return rooms.get(String(roomId || "").toUpperCase()) || null;
}

function findPlayerColor(room, token) {
  if (!room || !token) {
    return null;
  }
  if (room.players.white.token === token) {
    return "white";
  }
  if (room.players.black.token === token) {
    return "black";
  }
  return null;
}

function createRoomState(origin) {
  const roomId = createRoomId();
  const room = {
    id: roomId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    message: null,
    players: {
      white: { token: createToken() },
      black: { token: null },
    },
    ready: {
      white: false,
      black: false,
    },
    setups: {
      white: Engine.createDefaultSetup("white"),
      black: Engine.createDefaultSetup("black"),
    },
    game: null,
    chat: [],
    moveLog: [],
  };
  rooms.set(roomId, room);
  return {
    room,
    shareUrl: `${origin}/?room=${roomId}`,
  };
}

function touchRoom(room) {
  room.updatedAt = Date.now();
}

function playersMeta(room) {
  return {
    white: {
      joined: true,
      ready: room.ready.white,
    },
    black: {
      joined: Boolean(room.players.black.token),
      ready: room.ready.black,
    },
  };
}

function serializeSetupState(room, color, origin) {
  return {
    phase: "setup",
    roomId: room.id,
    roomUrl: `${origin}/?room=${room.id}`,
    color,
    players: playersMeta(room),
    mySetup: Engine.cloneSetup(room.setups[color]),
    message: room.message,
  };
}

function serializeRoomState(room, color, origin) {
  if (!room.game) {
    return serializeSetupState(room, color, origin);
  }

  return {
    phase: "playing",
    roomId: room.id,
    roomUrl: `${origin}/?room=${room.id}`,
    color,
    players: playersMeta(room),
    message: room.message,
    game: Engine.serializeGameForPlayer(room.game, color),
    moveLog: room.moveLog || [],
    chat: room.chat || [],
  };
}

function maybeStartGame(room) {
  if (!room.ready.white || !room.ready.black) {
    return;
  }

  try {
    room.game = Engine.createGame(room.setups.white, room.setups.black);
    room.message = null;
  } catch (error) {
    room.game = null;
    room.ready.white = false;
    room.ready.black = false;
    room.message = error.message;
  }
}

function cleanupRooms() {
  const maxAge = 1000 * 60 * 60 * 6;
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.updatedAt > maxAge) {
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanupRooms, 1000 * 60 * 10).unref();

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const segments = pathname.split("/").filter(Boolean);
  const origin = getOrigin(request);

  if (request.method === "GET" && pathname === "/api/health") {
    json(response, 200, { ok: true, rooms: rooms.size });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/rooms") {
    const { room, shareUrl } = createRoomState(origin);
    json(response, 201, {
      roomId: room.id,
      shareUrl,
      color: "white",
      token: room.players.white.token,
      state: serializeRoomState(room, "white", origin),
    });
    return true;
  }

  if (segments[0] !== "api" || segments[1] !== "rooms" || !segments[2]) {
    return false;
  }

  const room = getRoom(segments[2]);
  if (!room) {
    json(response, 404, { error: "Oda bulunamadı." });
    return true;
  }

  if (request.method === "POST" && segments[3] === "join") {
    if (room.players.black.token) {
      json(response, 409, { error: "Oda dolu." });
      return true;
    }

    room.players.black.token = createToken();
    room.ready.black = false;
    room.message = null;
    touchRoom(room);
    json(response, 200, {
      roomId: room.id,
      color: "black",
      token: room.players.black.token,
      state: serializeRoomState(room, "black", origin),
    });
    return true;
  }

  const body = request.method === "GET" ? {} : await parseBody(request);
  const token = request.method === "GET" ? url.searchParams.get("token") : body.token;
  const color = findPlayerColor(room, token);
  if (!color) {
    json(response, 403, { error: "Bu oda için oyuncu oturumu doğrulanamadı." });
    return true;
  }
  touchRoom(room);

  if (request.method === "GET" && segments[3] === "state") {
    json(response, 200, serializeRoomState(room, color, origin));
    return true;
  }

  if (request.method === "POST" && segments[3] === "setup") {
    if (room.game) {
      json(response, 409, { error: "Oyun başladıktan sonra kurulum değiştirilemez." });
      return true;
    }

    const validation = Engine.validateSetup(body.setup, color);
    if (!validation.ok) {
      json(response, 400, { error: validation.error });
      return true;
    }

    room.setups[color] = Engine.cloneSetup(body.setup);
    room.ready[color] = Boolean(body.ready);
    room.message = null;
    maybeStartGame(room);
    json(response, 200, serializeRoomState(room, color, origin));
    return true;
  }

  if (request.method === "POST" && segments[3] === "legal-moves") {
    if (!room.game) {
      json(response, 409, { error: "Oyun henüz başlamadı." });
      return true;
    }
    const from = Array.isArray(body.from) ? body.from : [];
    const moves = Engine.getLegalMoves(room.game, from[0], from[1]);
    json(response, 200, { moves });
    return true;
  }

  if (request.method === "POST" && segments[3] === "move") {
    if (!room.game) {
      json(response, 409, { error: "Oyun henüz başlamadı." });
      return true;
    }

    const result = Engine.makeMove(room.game, color, body.from, body.to);
    if (!result.ok) {
      json(response, 400, { error: result.error });
      return true;
    }

    room.game = result.game;
    room.message = null;
    // Track move in log
    const lm = result.game.lastMove || {};
    room.moveLog = room.moveLog || [];
    room.moveLog.push({ piece: lm.piece || '?', from: body.from, to: body.to, captured: lm.captured || null, color: color });
    json(response, 200, serializeRoomState(room, color, origin));
    return true;
  }

  if (request.method === "POST" && segments[3] === "hide") {
    if (!room.game) {
      json(response, 409, { error: "Oyun henüz başlamadı." });
      return true;
    }

    const result = Engine.hideAllPieces(room.game, color);
    if (!result.ok) {
      json(response, 400, { error: result.error });
      return true;
    }

    room.game = result.game;
    room.message = null;
    json(response, 200, serializeRoomState(room, color, origin));
    return true;
  }

  if (request.method === "POST" && segments[3] === "chat") {
    const msgText = String(body.text || "").trim().slice(0, 200);
    if (!msgText) {
      json(response, 400, { error: "Boş mesaj." });
      return true;
    }
    room.chat = room.chat || [];
    room.chat.push({ sender: color, text: msgText, time: Date.now() });
    if (room.chat.length > 100) room.chat.shift();
    json(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && segments[3] === "rematch") {
    room.game = null;
    room.ready.white = false;
    room.ready.black = false;
    room.moveLog = [];
    room.chat = [];
    room.message = "Yeni maç için taş dizilimlerini tekrar onaylayın.";
    json(response, 200, serializeRoomState(room, color, origin));
    return true;
  }

  json(response, 404, { error: "API uç noktası bulunamadı." });
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (handled) {
        return;
      }
    }

    if (request.method !== "GET") {
      text(response, 405, "Method Not Allowed");
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      file(response, "shadow_chess.html");
      return;
    }

    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!relativePath) {
      file(response, "shadow_chess.html");
      return;
    }

    file(response, relativePath);
  } catch (error) {
    json(response, 500, {
      error: error.message || "Sunucu hatası oluştu.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Shadow Chess sunucusu hazır: http://localhost:${PORT}`);
});
