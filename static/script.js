// ============================================================
//  SATRANÇ OYUNU – MİNİMAX AI (DÜZELTİLDİ, RASTGELE YEDEK)
// ============================================================

class ChessGame {
    constructor() {
        this.board = [];
        this.turn = 'W';
        this.selected = null;
        this.moveHistory = [];
        this.castlingRights = {
            W: { kingSide: true, queenSide: true },
            B: { kingSide: true, queenSide: true }
        };
        this.enPassantTarget = null;
        this.gameOver = false;
        this.winner = null;
        this.promotionPending = null;

        this.aiColor = 'B';
        this.depth = 2;

        this.stateHistory = [];
        this.dragSource = null;

        this.moveSound = new Audio('/static/sounds/move.wav');
        this.captureSound = new Audio('/static/sounds/capture.wav');

        this.boardEl = document.getElementById('board');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.moveHistoryList = document.getElementById('move-history');
        this.promotionModal = document.getElementById('promotion-modal');
        this.gameOverModal = document.getElementById('game-over-modal');
        this.gameOverMessage = document.getElementById('game-over-message');

        // İstatistikler
        this.winsEl = document.getElementById('wins');
        this.lossesEl = document.getElementById('losses');
        this.drawsEl = document.getElementById('draws');
        this.stats = this.loadStats();

        // Butonlar
        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('new-game-btn').addEventListener('click', () => this.reset());
        document.getElementById('undo-btn').addEventListener('click', () => this.undoMove());
        document.getElementById('save-btn').addEventListener('click', () => this.saveGame());
        document.getElementById('load-btn').addEventListener('click', () => this.loadGame());
        document.getElementById('reset-stats-btn').addEventListener('click', () => this.resetStats());

        // Renk ve zorluk
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.aiColor = btn.dataset.color === 'W' ? 'B' : 'W';
                console.log(`[AI] Oyuncu rengi seçildi: ${btn.dataset.color} → AI rengi: ${this.aiColor}`);
                this.reset();
            });
        });
        document.querySelectorAll('.depth-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.depth-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.depth = parseInt(btn.dataset.depth);
                console.log(`[AI] Zorluk seçildi: ${this.depth}`);
                this.reset();
            });
        });
        document.querySelector('.color-btn[data-color="W"]')?.classList.add('active');
        document.querySelector('.depth-btn[data-depth="2"]')?.classList.add('active');

        // Tema
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const theme = btn.dataset.theme;
                document.body.className = `theme-${theme}`;
                localStorage.setItem('chessTheme', theme);
            });
        });
        const savedTheme = localStorage.getItem('chessTheme') || 'classic';
        document.body.className = `theme-${savedTheme}`;
        document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`)?.classList.add('active');

        // Terfi
        document.querySelectorAll('#promotion-choices button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const piece = e.target.dataset.piece;
                this.promote(piece);
            });
        });

        // Sürükleme
        this.boardEl.addEventListener('dragstart', (e) => this.onDragStart(e));
        this.boardEl.addEventListener('dragover', (e) => this.onDragOver(e));
        this.boardEl.addEventListener('drop', (e) => this.onDrop(e));
        this.boardEl.addEventListener('dragend', (e) => this.onDragEnd(e));

        this.reset();
        this.updateStatsDisplay();
    }

    // ---------- İSTATİSTİKLER ----------
    loadStats() {
        try {
            const raw = localStorage.getItem('chessStats');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return { wins: 0, losses: 0, draws: 0 };
    }

    saveStats() {
        localStorage.setItem('chessStats', JSON.stringify(this.stats));
    }

    updateStatsDisplay() {
        this.winsEl.textContent = this.stats.wins;
        this.lossesEl.textContent = this.stats.losses;
        this.drawsEl.textContent = this.stats.draws;
    }

    resetStats() {
        if (confirm('İstatistikler sıfırlansın mı?')) {
            this.stats = { wins: 0, losses: 0, draws: 0 };
            this.saveStats();
            this.updateStatsDisplay();
            this.showTemporaryMessage('İstatistikler sıfırlandı!');
        }
    }

    // ---------- STATE KAYDETME ----------
    saveState() {
        this.stateHistory.push({
            board: this.board.map(row => [...row]),
            turn: this.turn,
            castlingRights: {
                W: { ...this.castlingRights.W },
                B: { ...this.castlingRights.B }
            },
            enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null,
            gameOver: this.gameOver,
            winner: this.winner,
            moveHistory: this.moveHistory.map(m => ({ ...m }))
        });
        if (this.stateHistory.length > 100) this.stateHistory.shift();
    }

    undoMove() {
        if (this.stateHistory.length === 0) return;
        if (this.promotionPending) return;
        if (this.gameOver) return;

        const state = this.stateHistory.pop();
        this.board = state.board;
        this.turn = state.turn;
        this.castlingRights = state.castlingRights;
        this.enPassantTarget = state.enPassantTarget;
        this.gameOver = state.gameOver;
        this.winner = state.winner;
        this.moveHistory = state.moveHistory || [];

        this.selected = null;
        this.dragSource = null;
        this.promotionPending = null;
        this.promotionModal.classList.add('hidden');
        if (this.gameOver) this.gameOverModal.classList.add('hidden');

        this.render();
        this.updateTurnDisplay();
        this.renderMoveHistory();

        if (!this.gameOver && this.turn === this.aiColor) {
            this.scheduleAIMove();
        }
    }

    // ---------- KAYDET / YÜKLE ----------
    saveGame() {
        const data = {
            board: this.board,
            turn: this.turn,
            castlingRights: this.castlingRights,
            enPassantTarget: this.enPassantTarget,
            gameOver: this.gameOver,
            winner: this.winner,
            moveHistory: this.moveHistory,
            aiColor: this.aiColor,
            depth: this.depth
        };
        localStorage.setItem('chessGame', JSON.stringify(data));
        this.showTemporaryMessage('Oyun kaydedildi! 💾');
    }

    loadGame() {
        const raw = localStorage.getItem('chessGame');
        if (!raw) {
            this.showTemporaryMessage('Kayıtlı oyun yok!');
            return;
        }
        try {
            const data = JSON.parse(raw);
            this.board = data.board;
            this.turn = data.turn;
            this.castlingRights = data.castlingRights;
            this.enPassantTarget = data.enPassantTarget;
            this.gameOver = data.gameOver;
            this.winner = data.winner;
            this.moveHistory = data.moveHistory || [];
            this.aiColor = data.aiColor || 'B';
            this.depth = data.depth || 2;
            document.querySelectorAll('.color-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.color === (this.aiColor === 'W' ? 'B' : 'W'));
            });
            document.querySelectorAll('.depth-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.depth) === this.depth);
            });
            this.selected = null;
            this.dragSource = null;
            this.promotionPending = null;
            this.promotionModal.classList.add('hidden');
            this.gameOverModal.classList.add('hidden');
            this.stateHistory = [];
            this.render();
            this.updateTurnDisplay();
            this.renderMoveHistory();
            this.showTemporaryMessage('Oyun yüklendi! 📂');
            if (!this.gameOver && this.turn === this.aiColor) {
                this.scheduleAIMove();
            }
        } catch (e) {
            this.showTemporaryMessage('Kayıt bozuk!');
            console.error(e);
        }
    }

    showTemporaryMessage(msg) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #2d2a26; color: #f0e9e1; padding: 12px 24px;
            border-radius: 30px; font-weight: bold; z-index: 200;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            transition: opacity 0.3s;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 400);
        }, 2000);
    }

    // ---------- RESET ----------
    reset() {
        this.initBoard();
        this.turn = 'W';
        this.selected = null;
        this.moveHistory = [];
        this.castlingRights = {
            W: { kingSide: true, queenSide: true },
            B: { kingSide: true, queenSide: true }
        };
        this.enPassantTarget = null;
        this.gameOver = false;
        this.winner = null;
        this.promotionPending = null;
        this.dragSource = null;
        this.stateHistory = [];
        this.promotionModal.classList.add('hidden');
        this.gameOverModal.classList.add('hidden');
        this.render();
        this.updateTurnDisplay();
        this.renderMoveHistory();

        if (this.aiColor === 'W' && this.turn === 'W') {
            this.scheduleAIMove();
        }
    }

    initBoard() {
        this.board = Array(8).fill().map(() => Array(8).fill(null));
        const backRank = (color) => [
            `${color}rook`, `${color}knight`, `${color}bishop`, `${color}queen`,
            `${color}king`, `${color}bishop`, `${color}knight`, `${color}rook`
        ];
        for (let c = 0; c < 8; c++) {
            this.board[0][c] = backRank('B')[c];
            this.board[1][c] = 'Bpawn';
            this.board[6][c] = 'Wpawn';
            this.board[7][c] = backRank('W')[c];
        }
    }

    // ---------- RENDER ----------
    render(animateTo = null) {
        this.boardEl.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = r;
                cell.dataset.col = c;

                const piece = this.board[r][c];
                if (piece) {
                    const span = document.createElement('span');
                    span.className = 'piece';
                    if (animateTo && r === animateTo.row && c === animateTo.col) {
                        span.classList.add('pop');
                    }
                    span.textContent = this.getUnicode(piece);
                    cell.appendChild(span);
                }

                if (piece && piece[0] === this.turn && !this.gameOver && !this.promotionPending) {
                    cell.draggable = true;
                } else {
                    cell.draggable = false;
                }

                this.boardEl.appendChild(cell);
            }
        }
        this.clearHighlights();
        if (this.gameOver) this.showGameOver();
        this.renderMoveHistory();
    }

    getUnicode(piece) {
        if (!piece) return '';
        const map = {
            'Wking': '♔', 'Wqueen': '♕', 'Wrook': '♖', 'Wbishop': '♗', 'Wknight': '♘', 'Wpawn': '♙',
            'Bking': '♚', 'Bqueen': '♛', 'Brook': '♜', 'Bbishop': '♝', 'Bknight': '♞', 'Bpawn': '♟'
        };
        return map[piece] || '';
    }

    clearHighlights() {
        document.querySelectorAll('.cell').forEach(el => {
            el.classList.remove('selected', 'highlight', 'legal-move', 'castling', 'check');
        });
    }

    highlightCells(moves, type = 'legal-move') {
        moves.forEach(({ row, col }) => {
            const idx = row * 8 + col;
            const el = this.boardEl.children[idx];
            if (el) el.classList.add(type);
        });
    }

    updateTurnDisplay() {
        const turnName = this.turn === 'W' ? 'Beyaz' : 'Siyah';
        const ai = this.aiColor === this.turn ? ' (AI)' : '';
        this.turnIndicator.textContent = `${turnName} oynar${ai}`;
    }

    getPiece(row, col) {
        if (row < 0 || row > 7 || col < 0 || col > 7) return null;
        return this.board[row][col];
    }

    // ---------- HAMLE GEÇMİŞİ ----------
    renderMoveHistory() {
        this.moveHistoryList.innerHTML = '';
        let moveNumber = 1;
        for (let i = 0; i < this.moveHistory.length; i += 2) {
            const li = document.createElement('li');
            let html = `<span class="move-number">${moveNumber}.</span>`;
            const w = this.moveHistory[i];
            if (w) {
                const wPiece = this.getUnicode(w.piece);
                const wFrom = String.fromCharCode(97 + w.from.col) + (8 - w.from.row);
                const wTo = String.fromCharCode(97 + w.to.col) + (8 - w.to.row);
                const wCap = w.captured ? ' ⨯' : '';
                html += `<span class="move-white">${wPiece}${wFrom}-${wTo}${wCap}</span>`;
            }
            const b = this.moveHistory[i+1];
            if (b) {
                const bPiece = this.getUnicode(b.piece);
                const bFrom = String.fromCharCode(97 + b.from.col) + (8 - b.from.row);
                const bTo = String.fromCharCode(97 + b.to.col) + (8 - b.to.row);
                const bCap = b.captured ? ' ⨯' : '';
                html += `<span class="move-black">${bPiece}${bFrom}-${bTo}${bCap}</span>`;
            }
            li.innerHTML = html;
            this.moveHistoryList.appendChild(li);
            moveNumber++;
        }
    }

    // ---------- HAMLE ÜRETME ----------
    getRawMoves(row, col, checkKingSafety = true) {
        const piece = this.getPiece(row, col);
        if (!piece) return [];
        const color = piece[0];
        const type = piece.slice(1);
        let moves = [];

        const addMove = (r, c) => {
            if (r < 0 || r > 7 || c < 0 || c > 7) return false;
            const target = this.getPiece(r, c);
            if (target && target[0] === color) return false;
            moves.push({ row: r, col: c });
            return !target;
        };

        const addSliding = (dirs) => {
            for (const [dr, dc] of dirs) {
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                    const target = this.getPiece(r, c);
                    if (target && target[0] === color) break;
                    moves.push({ row: r, col: c });
                    if (target) break;
                    r += dr;
                    c += dc;
                }
            }
        };

        switch (type) {
            case 'pawn': {
                const dir = color === 'W' ? -1 : 1;
                const startRow = color === 'W' ? 6 : 1;
                if (this.getPiece(row + dir, col) === null) {
                    moves.push({ row: row + dir, col });
                    if (row === startRow && this.getPiece(row + 2*dir, col) === null) {
                        moves.push({ row: row + 2*dir, col });
                    }
                }
                for (const dc of [-1, 1]) {
                    const nr = row + dir, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = this.getPiece(nr, nc);
                    if (target && target[0] !== color) moves.push({ row: nr, col: nc });
                    if (this.enPassantTarget && this.enPassantTarget.row === nr && this.enPassantTarget.col === nc) {
                        moves.push({ row: nr, col: nc, enPassant: true });
                    }
                }
                break;
            }
            case 'knight': {
                const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (const [dr, dc] of jumps) {
                    const nr = row + dr, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = this.getPiece(nr, nc);
                    if (!target || target[0] !== color) moves.push({ row: nr, col: nc });
                }
                break;
            }
            case 'bishop':
                addSliding([[1,1],[1,-1],[-1,1],[-1,-1]]);
                break;
            case 'rook':
                addSliding([[1,0],[-1,0],[0,1],[0,-1]]);
                break;
            case 'queen':
                addSliding([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
                break;
            case 'king': {
                const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
                for (const [dr, dc] of dirs) {
                    const nr = row + dr, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = this.getPiece(nr, nc);
                    if (!target || target[0] !== color) moves.push({ row: nr, col: nc });
                }
                const rights = this.castlingRights[color];
                const kingRow = color === 'W' ? 7 : 0;
                if (row === kingRow && col === 4) {
                    if (rights.kingSide &&
                        this.getPiece(kingRow, 5) === null &&
                        this.getPiece(kingRow, 6) === null &&
                        this.getPiece(kingRow, 7) === `${color}rook`) {
                        moves.push({ row: kingRow, col: 6, castling: 'kingSide' });
                    }
                    if (rights.queenSide &&
                        this.getPiece(kingRow, 1) === null &&
                        this.getPiece(kingRow, 2) === null &&
                        this.getPiece(kingRow, 3) === null &&
                        this.getPiece(kingRow, 0) === `${color}rook`) {
                        moves.push({ row: kingRow, col: 2, castling: 'queenSide' });
                    }
                }
                break;
            }
        }
        return moves;
    }

    // ---------- GEÇERLİ HAMLELER ----------
    getLegalMoves(row, col) {
        const piece = this.getPiece(row, col);
        if (!piece) return [];
        const color = piece[0];
        const raw = this.getRawMoves(row, col, false);
        const legal = [];
        for (const move of raw) {
            const captured = this.simulateMove(row, col, move.row, move.col, move);
            if (!this.isKingInCheckAfter(row, col, move.row, move.col, move, captured)) {
                legal.push(move);
            }
        }
        return legal;
    }

    // ---------- SİMÜLASYON ----------
    simulateMove(fromR, fromC, toR, toC, moveData) {
        const boardCopy = this.board.map(row => [...row]);
        const captured = boardCopy[toR][toC];
        boardCopy[toR][toC] = boardCopy[fromR][fromC];
        boardCopy[fromR][fromC] = null;
        if (moveData && moveData.enPassant) {
            boardCopy[fromR][toC] = null;
        }
        if (moveData && moveData.castling) {
            const row = fromR;
            if (moveData.castling === 'kingSide') {
                boardCopy[row][5] = boardCopy[row][7];
                boardCopy[row][7] = null;
            } else {
                boardCopy[row][3] = boardCopy[row][0];
                boardCopy[row][0] = null;
            }
        }
        return { board: boardCopy, captured };
    }

    // ---------- ŞAH KONTROLÜ ----------
    findKing(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c] === `${color}king`) return { row: r, col: c };
            }
        }
        return null;
    }

    isKingInCheck(color) {
        const king = this.findKing(color);
        if (!king) return true;
        const opponent = color === 'W' ? 'B' : 'W';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece[0] === opponent) {
                    const moves = this.getRawMoves(r, c, false);
                    for (const m of moves) {
                        if (m.row === king.row && m.col === king.col) return true;
                    }
                }
            }
        }
        return false;
    }

    isKingInCheckAfter(fromR, fromC, toR, toC, moveData, capturedInfo) {
        const boardCopy = this.board.map(row => [...row]);
        const piece = boardCopy[fromR][fromC];
        boardCopy[toR][toC] = piece;
        boardCopy[fromR][fromC] = null;
        if (moveData && moveData.enPassant) boardCopy[fromR][toC] = null;
        if (moveData && moveData.castling) {
            const row = fromR;
            if (moveData.castling === 'kingSide') {
                boardCopy[row][5] = boardCopy[row][7];
                boardCopy[row][7] = null;
            } else {
                boardCopy[row][3] = boardCopy[row][0];
                boardCopy[row][0] = null;
            }
        }
        const color = piece[0];
        let kingPos = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (boardCopy[r][c] === `${color}king`) {
                    kingPos = { row: r, col: c };
                    break;
                }
            }
            if (kingPos) break;
        }
        if (!kingPos) return true;
        const opponent = color === 'W' ? 'B' : 'W';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = boardCopy[r][c];
                if (p && p[0] === opponent) {
                    const moves = this.getRawMovesForBoard(r, c, boardCopy, false);
                    for (const m of moves) {
                        if (m.row === kingPos.row && m.col === kingPos.col) return true;
                    }
                }
            }
        }
        return false;
    }

    getRawMovesForBoard(row, col, board, checkKingSafety) {
        const piece = board[row][col];
        if (!piece) return [];
        const color = piece[0];
        const type = piece.slice(1);
        let moves = [];

        const addMove = (r, c) => {
            if (r < 0 || r > 7 || c < 0 || c > 7) return false;
            const target = board[r][c];
            if (target && target[0] === color) return false;
            moves.push({ row: r, col: c });
            return !target;
        };

        const addSliding = (dirs) => {
            for (const [dr, dc] of dirs) {
                let r = row + dr, c = col + dc;
                while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                    const target = board[r][c];
                    if (target && target[0] === color) break;
                    moves.push({ row: r, col: c });
                    if (target) break;
                    r += dr;
                    c += dc;
                }
            }
        };

        switch (type) {
            case 'pawn': {
                const dir = color === 'W' ? -1 : 1;
                const startRow = color === 'W' ? 6 : 1;
                if (board[row + dir]?.[col] === null) {
                    moves.push({ row: row + dir, col });
                    if (row === startRow && board[row + 2*dir]?.[col] === null) {
                        moves.push({ row: row + 2*dir, col });
                    }
                }
                for (const dc of [-1, 1]) {
                    const nr = row + dir, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = board[nr][nc];
                    if (target && target[0] !== color) moves.push({ row: nr, col: nc });
                }
                break;
            }
            case 'knight': {
                const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (const [dr, dc] of jumps) {
                    const nr = row + dr, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = board[nr][nc];
                    if (!target || target[0] !== color) moves.push({ row: nr, col: nc });
                }
                break;
            }
            case 'bishop': addSliding([[1,1],[1,-1],[-1,1],[-1,-1]]); break;
            case 'rook': addSliding([[1,0],[-1,0],[0,1],[0,-1]]); break;
            case 'queen': addSliding([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]); break;
            case 'king': {
                const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
                for (const [dr, dc] of dirs) {
                    const nr = row + dr, nc = col + dc;
                    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
                    const target = board[nr][nc];
                    if (!target || target[0] !== color) moves.push({ row: nr, col: nc });
                }
                break;
            }
        }
        return moves;
    }

    // ---------- HAMLE YAPMA ----------
    makeMove(fromR, fromC, toR, toC, moveData) {
        const piece = this.board[fromR][fromC];
        if (!piece) return false;
        const color = piece[0];
        const type = piece.slice(1);

        const legalMoves = this.getLegalMoves(fromR, fromC);
        const found = legalMoves.find(m => m.row === toR && m.col === toC);
        if (!found) return false;

        if (type === 'pawn' && (toR === 0 || toR === 7)) {
            this.promotionPending = { fromRow: fromR, fromCol: fromC, toRow: toR, toCol: toC, moveData };
            this.promotionModal.classList.remove('hidden');
            return true;
        }

        this.executeMove(fromR, fromC, toR, toC, moveData);
        if (!this.gameOver && this.turn === this.aiColor) {
            this.scheduleAIMove();
        }
        return true;
    }

    executeMove(fromR, fromC, toR, toC, moveData) {
        this.saveState();

        const piece = this.board[fromR][fromC];
        const color = piece[0];
        const captured = this.board[toR][toC];

        if (captured) this.playSound('capture');
        else this.playSound('move');

        this.moveHistory.push({ from: {row:fromR, col:fromC}, to: {row:toR, col:toC}, piece, captured, moveData });

        this.board[toR][toC] = piece;
        this.board[fromR][fromC] = null;

        if (moveData && moveData.enPassant) this.board[fromR][toC] = null;

        if (moveData && moveData.castling) {
            const row = fromR;
            if (moveData.castling === 'kingSide') {
                this.board[row][5] = this.board[row][7];
                this.board[row][7] = null;
            } else {
                this.board[row][3] = this.board[row][0];
                this.board[row][0] = null;
            }
            this.castlingRights[color].kingSide = false;
            this.castlingRights[color].queenSide = false;
        }

        if (piece === `${color}pawn` && Math.abs(toR - fromR) === 2) {
            this.enPassantTarget = { row: (fromR + toR) / 2, col: fromC };
        } else {
            this.enPassantTarget = null;
        }

        if (piece === `${color}king`) {
            this.castlingRights[color].kingSide = false;
            this.castlingRights[color].queenSide = false;
        }
        if (piece === `${color}rook`) {
            if (fromR === (color === 'W' ? 7 : 0) && fromC === 7) {
                this.castlingRights[color].kingSide = false;
            }
            if (fromR === (color === 'W' ? 7 : 0) && fromC === 0) {
                this.castlingRights[color].queenSide = false;
            }
        }

        this.turn = this.turn === 'W' ? 'B' : 'W';
        this.selected = null;
        this.dragSource = null;

        this.render({ row: toR, col: toC });
        this.updateTurnDisplay();
        this.checkGameState();

        if (!this.gameOver && this.turn === this.aiColor) {
            this.scheduleAIMove();
        }
    }

    playSound(type) {
        try {
            const sound = type === 'move' ? this.moveSound : this.captureSound;
            sound.currentTime = 0;
            sound.play().catch(e => {});
        } catch (e) {}
    }

    // ---------- TERFİ ----------
    promote(pieceType) {
        if (!this.promotionPending) return;
        const { fromRow, fromCol, toRow, toCol, moveData } = this.promotionPending;
        const color = this.turn;
        this.promotionPending = null;
        this.promotionModal.classList.add('hidden');

        this.saveState();

        this.board[toRow][toCol] = `${color}${pieceType}`;
        this.board[fromRow][fromCol] = null;

        if (moveData && moveData.enPassant) this.board[fromRow][toCol] = null;
        if (moveData && moveData.castling) {
            const row = fromRow;
            if (moveData.castling === 'kingSide') {
                this.board[row][5] = this.board[row][7];
                this.board[row][7] = null;
            } else {
                this.board[row][3] = this.board[row][0];
                this.board[row][0] = null;
            }
            this.castlingRights[color].kingSide = false;
            this.castlingRights[color].queenSide = false;
        }

        if (this.moveHistory.length > 0) {
            const last = this.moveHistory[this.moveHistory.length - 1];
            last.piece = `${color}${pieceType}`;
        }

        this.turn = this.turn === 'W' ? 'B' : 'W';
        this.render({ row: toRow, col: toCol });
        this.updateTurnDisplay();
        this.checkGameState();
        if (!this.gameOver && this.turn === this.aiColor) {
            this.scheduleAIMove();
        }
    }

    // ---------- OYUN DURUMU ve İSTATİSTİKLER ----------
    checkGameState() {
        const color = this.turn;
        const inCheck = this.isKingInCheck(color);
        let hasLegalMoves = false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p && p[0] === color) {
                    const moves = this.getLegalMoves(r, c);
                    if (moves.length > 0) {
                        hasLegalMoves = true;
                        break;
                    }
                }
            }
            if (hasLegalMoves) break;
        }

        if (!hasLegalMoves) {
            this.gameOver = true;
            if (inCheck) {
                this.winner = color === 'W' ? 'B' : 'W';
            } else {
                this.winner = null;
            }
            this.showGameOver();
            this.updateStatistics();
        }
    }

    updateStatistics() {
        if (!this.gameOver) return;
        const playerColor = this.aiColor === 'W' ? 'B' : 'W';
        if (this.winner === null) {
            this.stats.draws++;
        } else if (this.winner === playerColor) {
            this.stats.wins++;
        } else {
            this.stats.losses++;
        }
        this.saveStats();
        this.updateStatsDisplay();
    }

    showGameOver() {
        let msg = '';
        if (this.winner) {
            msg = `${this.winner === 'W' ? 'Beyaz' : 'Siyah'} kazandı! 🎉`;
        } else {
            msg = 'Berabere (Pat) 🤝';
        }
        this.gameOverMessage.textContent = msg;
        this.gameOverModal.classList.remove('hidden');
    }

    highlightLegalMoves(row, col) {
        const moves = this.getLegalMoves(row, col);
        const cellEls = this.boardEl.children;
        const idx = row * 8 + col;
        cellEls[idx].classList.add('selected');
        moves.forEach(m => {
            const targetIdx = m.row * 8 + m.col;
            cellEls[targetIdx].classList.add('legal-move');
            if (m.castling) cellEls[targetIdx].classList.add('castling');
        });
        if (this.isKingInCheck(this.turn)) {
            const king = this.findKing(this.turn);
            if (king) {
                const kIdx = king.row * 8 + king.col;
                cellEls[kIdx].classList.add('check');
            }
        }
    }

    // ---------- TIKLAMA ----------
    handleCellClick(row, col) {
        if (this.gameOver) return;
        if (this.promotionPending) return;
        if (this.turn === this.aiColor) return;

        const piece = this.getPiece(row, col);
        const color = piece ? piece[0] : null;

        if (this.selected) {
            const { row: sRow, col: sCol } = this.selected;
            if (sRow === row && sCol === col) {
                this.selected = null;
                this.render();
                return;
            }

            const legalMoves = this.getLegalMoves(sRow, sCol);
            const move = legalMoves.find(m => m.row === row && m.col === col);
            if (move) {
                const success = this.makeMove(sRow, sCol, row, col, move);
                if (success) return;
            }

            this.selected = null;
            this.render();
            if (color === this.turn) {
                this.selected = { row, col };
                this.render();
                this.highlightLegalMoves(row, col);
            }
            return;
        }

        if (color === this.turn) {
            this.selected = { row, col };
            this.render();
            this.highlightLegalMoves(row, col);
        }
    }

    // ---------- SÜRÜKLE-BIRAK ----------
    onDragStart(e) {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const piece = this.getPiece(row, col);
        if (!piece || piece[0] !== this.turn || this.gameOver || this.promotionPending) {
            e.preventDefault();
            return;
        }
        this.dragSource = { row, col };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${row},${col}`);
        cell.style.opacity = '0.5';
    }

    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    onDrop(e) {
        e.preventDefault();
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const toRow = parseInt(cell.dataset.row);
        const toCol = parseInt(cell.dataset.col);

        if (!this.dragSource) return;
        const { row: fromRow, col: fromCol } = this.dragSource;

        if (fromRow === toRow && fromCol === toCol) {
            this.dragSource = null;
            this.render();
            return;
        }

        const legalMoves = this.getLegalMoves(fromRow, fromCol);
        const move = legalMoves.find(m => m.row === toRow && m.col === toCol);
        if (move) {
            const success = this.makeMove(fromRow, fromCol, toRow, toCol, move);
            if (success) {
                this.dragSource = null;
                return;
            }
        }

        this.dragSource = null;
        this.render();
    }

    onDragEnd(e) {
        const cell = e.target.closest('.cell');
        if (cell) cell.style.opacity = '1';
        this.dragSource = null;
    }

    // ---------- YAPAY ZEKA (MİNİMAX DÜZELTİLDİ, RASTGELE YEDEK) ----------
    scheduleAIMove() {
        if (this.gameOver) return;
        if (this.turn !== this.aiColor) return;
        if (this.promotionPending) return;
        setTimeout(() => {
            if (this.gameOver) return;
            if (this.turn !== this.aiColor) return;
            if (this.promotionPending) return;
            this.doAIMove();
        }, 800);
    }

    doAIMove() {
        if (this.gameOver) return;
        if (this.turn !== this.aiColor) return;
        if (this.promotionPending) return;

        const bestMove = this.getBestMove(this.aiColor, this.depth);
        if (!bestMove) {
            console.log('AI hamle bulamadı!');
            // Rastgele hamle dene (yedek)
            const allMoves = this.getAllLegalMoves(this.aiColor);
            if (allMoves.length === 0) {
                console.log('Hiç hamle yok, oyun bitti mi?');
                return;
            }
            const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];
            const { fromRow, fromCol, toRow, toCol, moveData } = randomMove;
            this.executeMove(fromRow, fromCol, toRow, toCol, moveData);
            if (!this.gameOver && this.turn === this.aiColor) {
                this.scheduleAIMove();
            }
            return;
        }
        const { fromRow, fromCol, toRow, toCol, moveData } = bestMove;
        this.executeMove(fromRow, fromCol, toRow, toCol, moveData);
        if (!this.gameOver && this.turn === this.aiColor) {
            this.scheduleAIMove();
        }
    }

    getBestMove(color, depth) {
        const legalMoves = this.getAllLegalMoves(color);
        if (legalMoves.length === 0) return null;

        let bestMove = null;
        let bestScore = -Infinity;
        const isMaximizing = color === 'W';

        for (const move of legalMoves) {
            const { board: newBoard } = this.simulateMove(move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveData);
            const score = this.minimax(
                newBoard,
                depth - 1,
                -Infinity,
                Infinity,
                !isMaximizing,
                color === 'W' ? 'B' : 'W'
            );
            if ((isMaximizing && score > bestScore) || (!isMaximizing && score < bestScore)) {
                bestScore = score;
                bestMove = move;
            }
        }

        // Eğer hiç iyi hamle bulunamazsa rastgele seç
        if (!bestMove && legalMoves.length > 0) {
            console.warn('[getBestMove] Hiç iyi hamle bulunamadı, rastgele seçiliyor.');
            bestMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        }
        return bestMove;
    }

    minimax(board, depth, alpha, beta, isMaximizing, currentColor) {
        if (depth === 0) {
            return this.evaluateBoard(board);
        }

        const moves = this.getAllLegalMovesForBoard(board, currentColor);
        if (moves.length === 0) {
            const king = this.findKingForBoard(board, currentColor);
            if (!king) {
                return isMaximizing ? -10000 : 10000;
            }
            return 0;
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                const newBoard = this.simulateMoveOnBoard(board, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveData);
                const eval_ = this.minimax(newBoard, depth - 1, alpha, beta, false, currentColor === 'W' ? 'B' : 'W');
                maxEval = Math.max(maxEval, eval_);
                alpha = Math.max(alpha, eval_);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                const newBoard = this.simulateMoveOnBoard(board, move.fromRow, move.fromCol, move.toRow, move.toCol, move.moveData);
                const eval_ = this.minimax(newBoard, depth - 1, alpha, beta, true, currentColor === 'W' ? 'B' : 'W');
                minEval = Math.min(minEval, eval_);
                beta = Math.min(beta, eval_);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    evaluateBoard(board) {
        let score = 0;
        const pieceValues = {
            'pawn': 100,
            'knight': 320,
            'bishop': 330,
            'rook': 500,
            'queen': 900,
            'king': 20000
        };
        const pawnTable = [
            [0,  0,  0,  0,  0,  0,  0,  0],
            [50, 50, 50, 50, 50, 50, 50, 50],
            [10, 10, 20, 30, 30, 20, 10, 10],
            [5,  5, 10, 25, 25, 10,  5,  5],
            [0,  0,  0, 20, 20,  0,  0,  0],
            [5, -5,-10,  0,  0,-10, -5,  5],
            [5, 10, 10,-20,-20, 10, 10,  5],
            [0,  0,  0,  0,  0,  0,  0,  0]
        ];
        const knightTable = [
            [-50,-40,-30,-30,-30,-30,-40,-50],
            [-40,-20,  0,  0,  0,  0,-20,-40],
            [-30,  0, 10, 15, 15, 10,  0,-30],
            [-30,  5, 15, 20, 20, 15,  5,-30],
            [-30,  0, 15, 20, 20, 15,  0,-30],
            [-30,  5, 10, 15, 15, 10,  5,-30],
            [-40,-20,  0,  5,  5,  0,-20,-40],
            [-50,-40,-30,-30,-30,-30,-40,-50]
        ];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (!piece) continue;
                const color = piece[0];
                const type = piece.slice(1);
                const value = pieceValues[type] || 0;
                let posScore = 0;
                const rowIndex = color === 'W' ? r : 7 - r;
                const colIndex = c;
                if (type === 'pawn') posScore = pawnTable[rowIndex][colIndex];
                else if (type === 'knight') posScore = knightTable[rowIndex][colIndex];
                score += (color === 'W' ? 1 : -1) * (value + posScore);
            }
        }
        return score;
    }

    // ---------- YARDIMCI FONKSİYONLAR (AI İÇİN) ----------
    getAllLegalMovesForBoard(board, color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece[0] === color) {
                    const raw = this.getRawMovesForBoard(r, c, board, false);
                    for (const m of raw) {
                        if (!this.isKingInCheckAfterForBoard(board, r, c, m.row, m.col, m, color)) {
                            moves.push({
                                fromRow: r,
                                fromCol: c,
                                toRow: m.row,
                                toCol: m.col,
                                moveData: m
                            });
                        }
                    }
                }
            }
        }
        return moves;
    }

    simulateMoveOnBoard(board, fromR, fromC, toR, toC, moveData) {
        const newBoard = board.map(row => [...row]);
        const piece = newBoard[fromR][fromC];
        newBoard[toR][toC] = piece;
        newBoard[fromR][fromC] = null;
        if (moveData && moveData.enPassant) {
            newBoard[fromR][toC] = null;
        }
        if (moveData && moveData.castling) {
            const row = fromR;
            if (moveData.castling === 'kingSide') {
                newBoard[row][5] = newBoard[row][7];
                newBoard[row][7] = null;
            } else {
                newBoard[row][3] = newBoard[row][0];
                newBoard[row][0] = null;
            }
        }
        if (piece === `${piece[0]}pawn` && (toR === 0 || toR === 7)) {
            newBoard[toR][toC] = `${piece[0]}queen`;
        }
        return newBoard;
    }

    findKingForBoard(board, color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] === `${color}king`) return { row: r, col: c };
            }
        }
        return null;
    }

    isKingInCheckAfterForBoard(board, fromR, fromC, toR, toC, moveData, color) {
        const newBoard = this.simulateMoveOnBoard(board, fromR, fromC, toR, toC, moveData);
        const kingPos = this.findKingForBoard(newBoard, color);
        if (!kingPos) return true;
        const opponent = color === 'W' ? 'B' : 'W';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = newBoard[r][c];
                if (p && p[0] === opponent) {
                    const moves = this.getRawMovesForBoard(r, c, newBoard, false);
                    for (const m of moves) {
                        if (m.row === kingPos.row && m.col === kingPos.col) return true;
                    }
                }
            }
        }
        return false;
    }

    getAllLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece[0] === color) {
                    const legal = this.getLegalMoves(r, c);
                    for (const m of legal) {
                        moves.push({
                            fromRow: r,
                            fromCol: c,
                            toRow: m.row,
                            toCol: m.col,
                            moveData: m
                        });
                    }
                }
            }
        }
        return moves;
    }
}

// ---------- UYGULAMA BAŞLATMA ----------
document.addEventListener('DOMContentLoaded', () => {
    const game = new ChessGame();

    document.getElementById('board').addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        game.handleCellClick(row, col);
    });
});