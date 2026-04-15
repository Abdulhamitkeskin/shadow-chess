(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ShadowChessEngine = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  const COLORS = ["white", "black"];
  const HOME_ROWS = {
    white: [6, 7],
    black: [0, 1],
  };
  const PIECE_VALUES = {
    K: 99999,
    Q: 900,
    R: 500,
    B: 325,
    N: 320,
    P: 100,
  };
  const DEFAULT_BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const REQUIRED_COUNTS = {
    K: 1,
    Q: 1,
    R: 2,
    B: 2,
    N: 2,
    P: 8,
  };

  function emptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  function createPiece(type, color) {
    return {
      type,
      color,
      moved: false,
      revealedToOpponent: type === "K",
    };
  }

  function clonePiece(piece) {
    if (!piece) {
      return null;
    }

    return {
      type: piece.type,
      color: piece.color,
      moved: Boolean(piece.moved),
      revealedToOpponent: Boolean(piece.revealedToOpponent),
    };
  }

  function cloneBoard(board) {
    return board.map((row) => row.map((piece) => clonePiece(piece)));
  }

  function cloneSetup(setup) {
    return setup.map((row) => row.slice());
  }

  function cloneGame(game) {
    return {
      board: cloneBoard(game.board),
      turn: game.turn,
      over: Boolean(game.over),
      winner: game.winner,
      result: game.result,
      version: game.version,
      capturedBy: {
        white: [...game.capturedBy.white],
        black: [...game.capturedBy.black],
      },
      hideAvailable: {
        white: Boolean(game.hideAvailable.white),
        black: Boolean(game.hideAvailable.black),
      },
      lastMove: game.lastMove
        ? {
            from: [...game.lastMove.from],
            to: [...game.lastMove.to],
            piece: game.lastMove.piece,
            color: game.lastMove.color,
            captured: game.lastMove.captured,
            special: game.lastMove.special || null,
          }
        : null,
      check: {
        white: Boolean(game.check.white),
        black: Boolean(game.check.black),
      },
    };
  }

  function inBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  function opposite(color) {
    return color === "white" ? "black" : "white";
  }

  function getBackRank(color) {
    return color === "white" ? 7 : 0;
  }

  function listHomeSquares(color) {
    const squares = [];
    for (const row of HOME_ROWS[color]) {
      for (let col = 0; col < 8; col += 1) {
        squares.push([row, col]);
      }
    }
    return squares;
  }

  function isHomeSquare(color, row) {
    return HOME_ROWS[color].includes(row);
  }

  function createDefaultSetup(color) {
    const setup = emptyBoard();
    const pawnRow = color === "white" ? 6 : 1;
    const pieceRow = getBackRank(color);

    for (let col = 0; col < 8; col += 1) {
      setup[pawnRow][col] = "P";
      setup[pieceRow][col] = DEFAULT_BACK_RANK[col];
    }

    return setup;
  }

  function createRandomSetup(color) {
    const setup = emptyBoard();
    const bag = [];

    for (const [type, count] of Object.entries(REQUIRED_COUNTS)) {
      for (let index = 0; index < count; index += 1) {
        bag.push(type);
      }
    }

    for (let index = bag.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [bag[index], bag[other]] = [bag[other], bag[index]];
    }

    listHomeSquares(color).forEach(([row, col], index) => {
      setup[row][col] = bag[index];
    });

    return setup;
  }

  function validateSetup(setup, color) {
    if (!Array.isArray(setup) || setup.length !== 8) {
      return { ok: false, error: "Setup must be an 8x8 grid." };
    }

    const counts = {};

    for (let row = 0; row < 8; row += 1) {
      if (!Array.isArray(setup[row]) || setup[row].length !== 8) {
        return { ok: false, error: "Setup must be an 8x8 grid." };
      }

      for (let col = 0; col < 8; col += 1) {
        const type = setup[row][col];
        if (isHomeSquare(color, row)) {
          if (!REQUIRED_COUNTS[type]) {
            return { ok: false, error: "Every home square must contain a valid piece." };
          }
          counts[type] = (counts[type] || 0) + 1;
        } else if (type !== null) {
          return { ok: false, error: "Pieces can only be arranged inside the first two ranks." };
        }
      }
    }

    for (const [type, expected] of Object.entries(REQUIRED_COUNTS)) {
      if ((counts[type] || 0) !== expected) {
        return { ok: false, error: `Invalid count for ${type}.` };
      }
    }

    return { ok: true };
  }

  function createBoardFromSetups(whiteSetup, blackSetup) {
    const board = emptyBoard();

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (whiteSetup[row][col]) {
          board[row][col] = createPiece(whiteSetup[row][col], "white");
        } else if (blackSetup[row][col]) {
          board[row][col] = createPiece(blackSetup[row][col], "black");
        }
      }
    }

    return board;
  }

  function findKing(board, color) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (piece && piece.color === color && piece.type === "K") {
          return [row, col];
        }
      }
    }

    return null;
  }

  function squaresBetween(startCol, endCol) {
    const cols = [];
    const step = startCol < endCol ? 1 : -1;

    for (let col = startCol + step; col !== endCol; col += step) {
      cols.push(col);
    }

    return cols;
  }

  function squaresAlong(startCol, endCol) {
    if (startCol === endCol) {
      return [];
    }

    const cols = [];
    const step = startCol < endCol ? 1 : -1;

    for (let col = startCol + step; ; col += step) {
      cols.push(col);
      if (col === endCol) {
        break;
      }
    }

    return cols;
  }

  function findCastlingRook(board, row, kingCol, color, direction) {
    let col = kingCol + direction;

    while (inBounds(row, col)) {
      const piece = board[row][col];
      if (!piece) {
        col += direction;
        continue;
      }

      if (piece.color === color && piece.type === "R" && !piece.moved) {
        return col;
      }

      return null;
    }

    return null;
  }

  function isPathClear(board, row, startCol, endCol, ignoredCols) {
    return squaresAlong(startCol, endCol).every((col) => ignoredCols.has(col) || !board[row][col]);
  }

  function getCastlingOptions(game, row, col) {
    const board = game.board;
    const king = board[row][col];
    if (!king || king.type !== "K" || king.moved) {
      return [];
    }

    if (row !== getBackRank(king.color)) {
      return [];
    }

    const enemy = opposite(king.color);
    if (isSquareAttacked(board, row, col, enemy)) {
      return [];
    }

    const options = [];

    for (const side of [
      { direction: -1, kingTarget: 2, rookTarget: 3 },
      { direction: 1, kingTarget: 6, rookTarget: 5 },
    ]) {
      const rookCol = findCastlingRook(board, row, col, king.color, side.direction);
      if (rookCol === null || col === side.kingTarget) {
        continue;
      }

      if (squaresBetween(col, rookCol).some((file) => board[row][file])) {
        continue;
      }

      const ignoredCols = new Set([col, rookCol]);
      if (!isPathClear(board, row, col, side.kingTarget, ignoredCols)) {
        continue;
      }
      if (!isPathClear(board, row, rookCol, side.rookTarget, ignoredCols)) {
        continue;
      }

      const boardForSafety = cloneBoard(board);
      boardForSafety[row][col] = null;
      boardForSafety[row][rookCol] = null;

      let safe = true;
      for (const file of [col, ...squaresAlong(col, side.kingTarget)]) {
        if (file === rookCol) {
          continue;
        }
        if (isSquareAttacked(boardForSafety, row, file, enemy)) {
          safe = false;
          break;
        }
      }

      if (!safe) {
        continue;
      }

      options.push({
        from: [row, col],
        to: [row, side.kingTarget],
        rookFrom: [row, rookCol],
        rookTo: [row, side.rookTarget],
      });
    }

    return options;
  }

  function resolveCastling(board, from, to) {
    const [fromRow, fromCol] = from;
    const piece = board[fromRow][fromCol];
    if (!piece || piece.type !== "K" || fromRow !== to[0]) {
      return null;
    }

    const pseudoGame = {
      board,
      turn: piece.color,
      over: false,
    };

    return (
      getCastlingOptions(pseudoGame, fromRow, fromCol).find(
        (option) => option.to[0] === to[0] && option.to[1] === to[1]
      ) || null
    );
  }

  function collectPseudoMoves(game, row, col, attacksOnly) {
    const board = game.board;
    const piece = board[row][col];
    if (!piece) {
      return [];
    }

    const moves = [];
    const enemy = opposite(piece.color);
    const direction = piece.color === "white" ? -1 : 1;

    function slide(deltaRow, deltaCol) {
      let nextRow = row + deltaRow;
      let nextCol = col + deltaCol;

      while (inBounds(nextRow, nextCol)) {
        const target = board[nextRow][nextCol];
        if (!target) {
          if (!attacksOnly) {
            moves.push([nextRow, nextCol]);
          }
        } else {
          if (target.color !== piece.color) {
            moves.push([nextRow, nextCol]);
          }
          break;
        }

        nextRow += deltaRow;
        nextCol += deltaCol;
      }
    }

    if (piece.type === "P") {
      for (const deltaCol of [-1, 1]) {
        const captureRow = row + direction;
        const captureCol = col + deltaCol;
        if (!inBounds(captureRow, captureCol)) {
          continue;
        }

        if (attacksOnly) {
          moves.push([captureRow, captureCol]);
          continue;
        }

        const target = board[captureRow][captureCol];
        if (target && target.color === enemy) {
          moves.push([captureRow, captureCol]);
        }
      }

      if (attacksOnly) {
        return moves;
      }

      const oneStep = row + direction;
      if (inBounds(oneStep, col) && !board[oneStep][col]) {
        moves.push([oneStep, col]);
        const twoStep = row + direction * 2;
        if (!piece.moved && inBounds(twoStep, col) && !board[twoStep][col]) {
          moves.push([twoStep, col]);
        }
      }

      return moves;
    }

    if (piece.type === "N") {
      for (const [deltaRow, deltaCol] of [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ]) {
        const nextRow = row + deltaRow;
        const nextCol = col + deltaCol;
        if (!inBounds(nextRow, nextCol)) {
          continue;
        }

        const target = board[nextRow][nextCol];
        if (!target || target.color !== piece.color) {
          moves.push([nextRow, nextCol]);
        }
      }

      return moves;
    }

    if (piece.type === "B" || piece.type === "Q") {
      slide(-1, -1);
      slide(-1, 1);
      slide(1, -1);
      slide(1, 1);
    }

    if (piece.type === "R" || piece.type === "Q") {
      slide(-1, 0);
      slide(1, 0);
      slide(0, -1);
      slide(0, 1);
    }

    if (piece.type === "K") {
      for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
        for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
          if (!deltaRow && !deltaCol) {
            continue;
          }

          const nextRow = row + deltaRow;
          const nextCol = col + deltaCol;
          if (!inBounds(nextRow, nextCol)) {
            continue;
          }

          const target = board[nextRow][nextCol];
          if (!target || target.color !== piece.color) {
            moves.push([nextRow, nextCol]);
          }
        }
      }

      if (!attacksOnly) {
        getCastlingOptions(game, row, col).forEach((option) => {
          moves.push(option.to);
        });
      }
    }

    return moves;
  }

  function isSquareAttacked(board, row, col, byColor) {
    const pseudoGame = {
      board,
      turn: byColor,
      over: false,
    };

    for (let sourceRow = 0; sourceRow < 8; sourceRow += 1) {
      for (let sourceCol = 0; sourceCol < 8; sourceCol += 1) {
        const piece = board[sourceRow][sourceCol];
        if (!piece || piece.color !== byColor) {
          continue;
        }

        const attacks = collectPseudoMoves(pseudoGame, sourceRow, sourceCol, true);
        if (attacks.some(([targetRow, targetCol]) => targetRow === row && targetCol === col)) {
          return true;
        }
      }
    }

    return false;
  }

  function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) {
      return false;
    }

    return isSquareAttacked(board, king[0], king[1], opposite(color));
  }

  function applyMoveOnBoard(board, from, to) {
    const [fromRow, fromCol] = from;
    const [toRow, toCol] = to;
    const piece = board[fromRow][fromCol];
    if (!piece) {
      return { captured: null, movedPiece: null, special: null };
    }

    const castling = resolveCastling(board, from, to);
    let captured = board[toRow][toCol];

    if (castling) {
      captured = null;
    }

    const rookPiece = castling ? board[castling.rookFrom[0]][castling.rookFrom[1]] : null;
    board[fromRow][fromCol] = null;

    if (castling && rookPiece) {
      board[castling.rookFrom[0]][castling.rookFrom[1]] = null;
    }

    board[toRow][toCol] = piece;

    if (castling && rookPiece) {
      board[castling.rookTo[0]][castling.rookTo[1]] = rookPiece;
      rookPiece.moved = true;
      rookPiece.revealedToOpponent = true;
    }

    piece.moved = true;
    piece.revealedToOpponent = true;

    if (piece.type === "P" && (toRow === 0 || toRow === 7)) {
      piece.type = "Q";
      piece.revealedToOpponent = true;
    }

    return {
      captured: clonePiece(captured),
      movedPiece: piece,
      special: castling ? "castle" : null,
    };
  }

  function getLegalMoves(game, row, col) {
    const piece = game.board[row][col];
    if (!piece || piece.color !== game.turn || game.over) {
      return [];
    }

    return collectPseudoMoves(game, row, col, false).filter(([targetRow, targetCol]) => {
      const boardCopy = cloneBoard(game.board);
      applyMoveOnBoard(boardCopy, [row, col], [targetRow, targetCol]);
      return !isInCheck(boardCopy, piece.color);
    });
  }

  function hasAnyLegalMoves(game, color) {
    const testGame = {
      board: game.board,
      turn: color,
      over: false,
    };

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (piece && piece.color === color && getLegalMoves(testGame, row, col).length) {
          return true;
        }
      }
    }

    return false;
  }

  function createGame(whiteSetup, blackSetup) {
    const whiteCheck = validateSetup(whiteSetup, "white");
    if (!whiteCheck.ok) {
      throw new Error(whiteCheck.error);
    }

    const blackCheck = validateSetup(blackSetup, "black");
    if (!blackCheck.ok) {
      throw new Error(blackCheck.error);
    }

    const board = createBoardFromSetups(whiteSetup, blackSetup);
    if (isInCheck(board, "white") || isInCheck(board, "black")) {
      throw new Error("A setup cannot begin with a king already in check.");
    }

    return {
      board,
      turn: "white",
      over: false,
      winner: null,
      result: null,
      version: 1,
      capturedBy: {
        white: [],
        black: [],
      },
      hideAvailable: {
        white: true,
        black: true,
      },
      lastMove: null,
      check: {
        white: false,
        black: false,
      },
    };
  }

  function makeMove(game, color, from, to) {
    if (game.over) {
      return { ok: false, error: "Game is already over." };
    }
    if (game.turn !== color) {
      return { ok: false, error: "It is not your turn." };
    }

    const [fromRow, fromCol] = from || [];
    const [toRow, toCol] = to || [];
    if (!inBounds(fromRow, fromCol) || !inBounds(toRow, toCol)) {
      return { ok: false, error: "Move is outside the board." };
    }

    const piece = game.board[fromRow][fromCol];
    if (!piece || piece.color !== color) {
      return { ok: false, error: "That piece does not belong to you." };
    }

    const legalMoves = getLegalMoves(game, fromRow, fromCol);
    if (!legalMoves.some(([row, col]) => row === toRow && col === toCol)) {
      return { ok: false, error: "Illegal move." };
    }

    const nextGame = cloneGame(game);
    const movingPiece = clonePiece(nextGame.board[fromRow][fromCol]);
    const outcome = applyMoveOnBoard(nextGame.board, [fromRow, fromCol], [toRow, toCol]);

    if (outcome.captured) {
      nextGame.capturedBy[color].push(outcome.captured.type);
    }

    nextGame.lastMove = {
      from: [fromRow, fromCol],
      to: [toRow, toCol],
      piece: movingPiece.type,
      color,
      captured: outcome.captured ? outcome.captured.type : null,
      special: outcome.special,
    };

    if (outcome.captured && outcome.captured.type === "K") {
      nextGame.over = true;
      nextGame.winner = color;
      nextGame.result = "king-capture";
      nextGame.version += 1;
      return { ok: true, game: nextGame };
    }

    const nextColor = opposite(color);
    nextGame.turn = nextColor;
    nextGame.check.white = isInCheck(nextGame.board, "white");
    nextGame.check.black = isInCheck(nextGame.board, "black");

    if (!hasAnyLegalMoves(nextGame, nextColor)) {
      nextGame.over = true;
      if (nextGame.check[nextColor]) {
        nextGame.winner = color;
        nextGame.result = "checkmate";
      } else {
        nextGame.winner = null;
        nextGame.result = "stalemate";
      }
    }

    nextGame.version += 1;
    return { ok: true, game: nextGame };
  }

  function hideAllPieces(game, color) {
    if (game.over) {
      return { ok: false, error: "Game is already over." };
    }
    if (game.turn !== color) {
      return { ok: false, error: "It is not your turn." };
    }
    if (!game.hideAvailable[color]) {
      return { ok: false, error: "Fog pulse has already been used." };
    }

    const nextGame = cloneGame(game);
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = nextGame.board[row][col];
        if (!piece || piece.color !== color || piece.type === "K") {
          continue;
        }
        piece.revealedToOpponent = false;
      }
    }

    nextGame.hideAvailable[color] = false;
    nextGame.version += 1;
    return { ok: true, game: nextGame };
  }

  function countLegalMoves(game, color) {
    let total = 0;
    const pseudoGame = {
      board: game.board,
      turn: color,
      over: false,
    };

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (piece && piece.color === color) {
          total += getLegalMoves(pseudoGame, row, col).length;
        }
      }
    }

    return total;
  }

  function evaluate(game, perspective) {
    if (game.over) {
      if (game.winner === perspective) {
        return 1000000;
      }
      if (game.winner && game.winner !== perspective) {
        return -1000000;
      }
      return 0;
    }

    let score = 0;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (!piece) {
          continue;
        }

        const visibilityBonus = piece.type !== "K" && !piece.revealedToOpponent ? 18 : 0;
        const centerBonus = 3.5 - (Math.abs(3.5 - row) + Math.abs(3.5 - col)) / 2;
        const signed = piece.color === perspective ? 1 : -1;
        score += signed * ((PIECE_VALUES[piece.type] || 0) + visibilityBonus + centerBonus * 5);
      }
    }

    score += (countLegalMoves(game, perspective) - countLegalMoves(game, opposite(perspective))) * 2;

    if (game.check[perspective]) {
      score -= 40;
    }
    if (game.check[opposite(perspective)]) {
      score += 40;
    }

    return score;
  }

  function listAllMoves(game, color) {
    const moves = [];
    const pseudoGame = {
      board: game.board,
      turn: color,
      over: false,
    };

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (!piece || piece.color !== color) {
          continue;
        }

        getLegalMoves(pseudoGame, row, col).forEach(([targetRow, targetCol]) => {
          moves.push({
            from: [row, col],
            to: [targetRow, targetCol],
          });
        });
      }
    }

    return moves;
  }

  function minimax(game, depth, alpha, beta, currentColor, perspective) {
    if (depth === 0 || game.over) {
      return { score: evaluate(game, perspective) };
    }

    const moves = listAllMoves(game, currentColor);
    if (!moves.length) {
      return { score: evaluate(game, perspective) };
    }

    if (currentColor === perspective) {
      let best = { score: -Infinity, move: moves[0] };

      for (const move of moves) {
        const result = makeMove(game, currentColor, move.from, move.to);
        if (!result.ok) {
          continue;
        }

        const line = minimax(result.game, depth - 1, alpha, beta, opposite(currentColor), perspective);
        if (line.score > best.score) {
          best = { score: line.score, move };
        }
        alpha = Math.max(alpha, line.score);
        if (beta <= alpha) {
          break;
        }
      }

      return best;
    }

    let best = { score: Infinity, move: moves[0] };

    for (const move of moves) {
      const result = makeMove(game, currentColor, move.from, move.to);
      if (!result.ok) {
        continue;
      }

      const line = minimax(result.game, depth - 1, alpha, beta, opposite(currentColor), perspective);
      if (line.score < best.score) {
        best = { score: line.score, move };
      }
      beta = Math.min(beta, line.score);
      if (beta <= alpha) {
        break;
      }
    }

    return best;
  }

  function countVisiblePieces(game, color) {
    let count = 0;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = game.board[row][col];
        if (piece && piece.color === color && piece.type !== "K" && piece.revealedToOpponent) {
          count += 1;
        }
      }
    }

    return count;
  }

  function chooseCpuAction(game, color) {
    const moves = listAllMoves(game, color);
    if (!moves.length) {
      return { move: null, useHide: false };
    }

    const depth = moves.length <= 14 ? 3 : 2;
    const scoredMoves = moves.map((move) => {
      const result = makeMove(game, color, move.from, move.to);
      if (!result.ok) {
        return { move, score: -Infinity };
      }

      const future = minimax(result.game, depth - 1, -Infinity, Infinity, opposite(color), color);
      let score = future.score;
      const target = game.board[move.to[0]][move.to[1]];
      if (target) {
        score += (PIECE_VALUES[target.type] || 0) * 0.04;
      }
      if (result.game.lastMove && result.game.lastMove.special === "castle") {
        score += 24;
      }

      return { move, score };
    });

    scoredMoves.sort((left, right) => right.score - left.score);
    const topScore = scoredMoves[0].score;
    const bestPool = scoredMoves.filter((entry) => Math.abs(entry.score - topScore) < 0.001);
    const choice = bestPool[Math.floor(Math.random() * bestPool.length)];

    return {
      move: choice.move,
      useHide: game.hideAvailable[color] && countVisiblePieces(game, color) >= 3,
    };
  }

  function maskPiece(piece, viewerColor) {
    if (!piece) {
      return null;
    }

    const isVisible = piece.color === viewerColor || piece.type === "K" || piece.revealedToOpponent;
    return {
      color: piece.color,
      type: isVisible ? piece.type : null,
      hidden: !isVisible,
      moved: Boolean(piece.moved),
    };
  }

  function serializeGameForPlayer(game, viewerColor) {
    return {
      turn: game.turn,
      over: game.over,
      winner: game.winner,
      result: game.result,
      version: game.version,
      lastMove: game.lastMove
        ? {
            from: [...game.lastMove.from],
            to: [...game.lastMove.to],
            piece: game.lastMove.piece,
            color: game.lastMove.color,
            captured: game.lastMove.captured,
            special: game.lastMove.special || null,
          }
        : null,
      capturedBy: {
        white: [...game.capturedBy.white],
        black: [...game.capturedBy.black],
      },
      hideAvailable: {
        self: game.hideAvailable[viewerColor],
        opponent: game.hideAvailable[opposite(viewerColor)],
      },
      check: {
        self: game.check[viewerColor],
        opponent: game.check[opposite(viewerColor)],
      },
      board: game.board.map((row) => row.map((piece) => maskPiece(piece, viewerColor))),
    };
  }

  return {
    COLORS,
    HOME_ROWS,
    PIECE_VALUES,
    emptyBoard,
    cloneBoard,
    cloneSetup,
    cloneGame,
    createDefaultSetup,
    createRandomSetup,
    validateSetup,
    createBoardFromSetups,
    createGame,
    getLegalMoves,
    makeMove,
    hideAllPieces,
    serializeGameForPlayer,
    chooseCpuAction,
    isInCheck,
    listHomeSquares,
    opposite,
  };
});
