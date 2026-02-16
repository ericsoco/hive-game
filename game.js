// Hex Zone Control - Two Player Board Game
// A hexagonal grid game with zone of control mechanics

// Constants
const HEX_SIZE = 28; // Radius of each hexagon
const GRID_SIZE = 8; // Number of hexes on each side
const TILES_PER_PLAYER = 20;
const ZOC_DISPLAY_DURATION = 1500; // ms to show ZOC after placing a tile

// Casino felt green color
const FELT_GREEN = '#1b5e20';
const FELT_DARK = '#0d3d0f';

// Players
const PLAYER = {
    WHITE: 'white',
    BLACK: 'black'
};

// Game State
let gameState = {
    currentPlayer: PLAYER.WHITE,
    tiles: new Map(), // Map of "q,r" -> player
    whiteTilesRemaining: TILES_PER_PLAYER,
    blackTilesRemaining: TILES_PER_PLAYER,
    hoveredHex: null,
    lastPlacedTile: null,
    lastPlacedTime: 0,
    gameOver: false,
    debugMode: false,
    animatingFlips: [], // Array of {q, r, delay} for animated flips
    isAnimating: false
};

// Canvas and context
let canvas, ctx;
let canvasWidth, canvasHeight;
let centerX, centerY;

// Hex coordinate system using axial coordinates (q, r)
// Reference: https://www.redblobgames.com/grids/hexagons/

// Initialize the game
function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    // Calculate canvas size based on grid (flat-top orientation)
    const hexWidth = Math.sqrt(3) * HEX_SIZE;
    const hexHeight = HEX_SIZE * 2;
    
    // For a hexagonal grid, we need enough space for all hexes
    canvasWidth = Math.ceil((GRID_SIZE * 2 + 1) * hexWidth * 0.9);
    canvasHeight = Math.ceil((GRID_SIZE * 2 + 1) * hexHeight * 0.78);
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    centerX = canvasWidth / 2;
    centerY = canvasHeight / 2;
    
    // Event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    document.getElementById('play-again').addEventListener('click', resetGame);
    document.getElementById('restart-btn').addEventListener('click', resetGame);
    document.getElementById('debug-btn').addEventListener('click', toggleDebugMode);
    
    // Initial render
    updateUI();
    render();
}

// Toggle debug mode
function toggleDebugMode() {
    gameState.debugMode = !gameState.debugMode;
    document.getElementById('debug-btn').classList.toggle('active', gameState.debugMode);
    render();
}

// Convert axial coordinates to pixel coordinates (flat-top orientation)
function hexToPixel(q, r) {
    const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    const y = HEX_SIZE * (3/2 * r);
    return { x: centerX + x, y: centerY + y };
}

// Convert pixel coordinates to axial coordinates (flat-top orientation)
function pixelToHex(x, y) {
    const px = x - centerX;
    const py = y - centerY;
    
    const q = (Math.sqrt(3)/3 * px - 1/3 * py) / HEX_SIZE;
    const r = (2/3 * py) / HEX_SIZE;
    
    return hexRound(q, r);
}

// Round fractional hex coordinates to nearest hex
function hexRound(q, r) {
    const s = -q - r;
    
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    
    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);
    
    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }
    
    return { q: rq, r: rr };
}

// Check if a hex coordinate is within the grid bounds
function isValidHex(q, r) {
    const s = -q - r;
    return Math.abs(q) < GRID_SIZE && Math.abs(r) < GRID_SIZE && Math.abs(s) < GRID_SIZE;
}

// Get all valid hexes in the grid
function getAllValidHexes() {
    const hexes = [];
    for (let q = -(GRID_SIZE - 1); q < GRID_SIZE; q++) {
        for (let r = -(GRID_SIZE - 1); r < GRID_SIZE; r++) {
            if (isValidHex(q, r)) {
                hexes.push({ q, r });
            }
        }
    }
    return hexes;
}

// Get the 6 neighboring hexes
function getNeighbors(q, r) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 }    // Southeast
    ];
    
    return directions.map(d => ({
        q: q + d.q,
        r: r + d.r
    })).filter(h => isValidHex(h.q, h.r));
}

// Get all 6 surrounding hexes, including invalid ones
function getSurroundingHexes(q, r) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 }    // Southeast
    ];
    
    return directions.map(d => ({
        q: q + d.q,
        r: r + d.r
    }));
}

// Get ZOC hexes (tile's own cell + 6 surrounding hexes = 7 total)
function getZOCHexes(q, r) {
    const surrounding = getSurroundingHexes(q, r);
    return [{ q, r }, ...surrounding];
}

// Get hex key for the tiles map
function hexKey(q, r) {
    return `${q},${r}`;
}

// Get all tiles that belong to a player
function getPlayerTiles(player) {
    const tiles = [];
    gameState.tiles.forEach((tilePlayer, key) => {
        if (tilePlayer === player) {
            const [q, r] = key.split(',').map(Number);
            tiles.push({ q, r });
        }
    });
    return tiles;
}

// Calculate the Zone of Control for a player
// Returns a Set of hex keys that are in the player's ZOC
// ZOC includes the tile's own cell + 6 surrounding hexes (7 total per tile)
function calculateZOC(player) {
    const zoc = new Set();
    const playerTiles = getPlayerTiles(player);
    
    playerTiles.forEach(tile => {
        const zocHexes = getZOCHexes(tile.q, tile.r);
        zocHexes.forEach(hex => {
            if (isValidHex(hex.q, hex.r)) {
                zoc.add(hexKey(hex.q, hex.r));
            }
        });
    });
    
    return zoc;
}

// Check if a tile is surrounded by enemy ZOC
function isTileSurrounded(q, r, enemyZOC) {
    const surrounding = getSurroundingHexes(q, r);
    
    for (const hex of surrounding) {
        // If the surrounding hex is outside the board, it doesn't count against surrounding
        if (!isValidHex(hex.q, hex.r)) {
            continue;
        }
        // If any valid surrounding hex is NOT in enemy ZOC, tile is not surrounded
        if (!enemyZOC.has(hexKey(hex.q, hex.r))) {
            return false;
        }
    }
    
    return true;
}

// Get tiles in straight lines from a hex in all 6 directions (for surrounding rule)
function getTilesInStraightLines(startQ, startR, player) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 }    // Southeast
    ];
    
    const tilesToFlip = [];
    
    for (const dir of directions) {
        let q = startQ + dir.q;
        let r = startR + dir.r;
        
        while (isValidHex(q, r)) {
            const key = hexKey(q, r);
            if (gameState.tiles.get(key) === player) {
                tilesToFlip.push({ q, r });
                q += dir.q;
                r += dir.r;
            } else {
                break; // Stop at empty cell or enemy tile
            }
        }
    }
    
    return tilesToFlip;
}

// Othello rule: Get opponent tiles to flip when placing a tile
// Returns array of {q, r, distance} for tiles that should be flipped
function getOthelloFlips(placedQ, placedR, currentPlayer) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 }    // Southeast
    ];
    
    const opponent = currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    const allFlips = [];
    
    for (const dir of directions) {
        const lineFlips = [];
        let q = placedQ + dir.q;
        let r = placedR + dir.r;
        let distance = 1;
        
        // Collect opponent tiles in this direction
        while (isValidHex(q, r)) {
            const key = hexKey(q, r);
            const tileOwner = gameState.tiles.get(key);
            
            if (tileOwner === opponent) {
                lineFlips.push({ q, r, distance });
                q += dir.q;
                r += dir.r;
                distance++;
            } else if (tileOwner === currentPlayer) {
                // Found our own tile - flip all collected opponent tiles
                allFlips.push(...lineFlips);
                break;
            } else {
                // Empty cell - no flips in this direction
                break;
            }
        }
    }
    
    return allFlips;
}

// Flip tiles to the other player
function flipTiles(tiles, newPlayer) {
    tiles.forEach(tile => {
        gameState.tiles.set(hexKey(tile.q, tile.r), newPlayer);
    });
}

// Process surrounded tiles after a move
function processSurroundedTiles(attackingPlayer) {
    const defendingPlayer = attackingPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    const attackerZOC = calculateZOC(attackingPlayer);
    const defendingTiles = getPlayerTiles(defendingPlayer);
    
    const surroundedTiles = [];
    
    // Find all surrounded tiles
    for (const tile of defendingTiles) {
        if (isTileSurrounded(tile.q, tile.r, attackerZOC)) {
            surroundedTiles.push(tile);
        }
    }
    
    // For each surrounded tile, flip it and adjacent tiles in straight lines
    for (const surrounded of surroundedTiles) {
        // Get tiles in straight lines from the surrounded tile
        const linesTiles = getTilesInStraightLines(surrounded.q, surrounded.r, defendingPlayer);
        
        // Flip the surrounded tile
        gameState.tiles.set(hexKey(surrounded.q, surrounded.r), attackingPlayer);
        
        // Flip the line tiles
        flipTiles(linesTiles, attackingPlayer);
    }
    
    return surroundedTiles.length > 0;
}

// Place a tile
function placeTile(q, r) {
    if (gameState.gameOver || gameState.isAnimating) return false;
    
    const key = hexKey(q, r);
    
    // Check if hex is valid and empty
    if (!isValidHex(q, r) || gameState.tiles.has(key)) {
        return false;
    }
    
    // Check if current player has tiles remaining
    if (gameState.currentPlayer === PLAYER.WHITE && gameState.whiteTilesRemaining <= 0) {
        return false;
    }
    if (gameState.currentPlayer === PLAYER.BLACK && gameState.blackTilesRemaining <= 0) {
        return false;
    }
    
    const currentPlayer = gameState.currentPlayer;
    
    // Place the tile
    gameState.tiles.set(key, currentPlayer);
    
    // Decrease tiles remaining
    if (currentPlayer === PLAYER.WHITE) {
        gameState.whiteTilesRemaining--;
    } else {
        gameState.blackTilesRemaining--;
    }
    
    // Record last placed tile for ZOC display
    gameState.lastPlacedTile = { q, r, player: currentPlayer };
    gameState.lastPlacedTime = Date.now();
    
    // Get Othello flips (lines of opponent tiles between placed tile and own tile)
    const othelloFlips = getOthelloFlips(q, r, currentPlayer);
    
    // Process surrounded tiles
    const surroundedFlips = getSurroundedFlips(currentPlayer);
    
    // Combine all flips, avoiding duplicates, with distance info
    const allFlipsMap = new Map();
    
    othelloFlips.forEach(flip => {
        const flipKey = hexKey(flip.q, flip.r);
        if (!allFlipsMap.has(flipKey)) {
            allFlipsMap.set(flipKey, flip);
        }
    });
    
    surroundedFlips.forEach(flip => {
        const flipKey = hexKey(flip.q, flip.r);
        if (!allFlipsMap.has(flipKey)) {
            allFlipsMap.set(flipKey, { ...flip, distance: flip.distance || 1 });
        }
    });
    
    const allFlips = Array.from(allFlipsMap.values());
    
    if (allFlips.length > 0) {
        // Animate flips
        animateFlips(allFlips, currentPlayer);
    } else {
        // No flips, proceed immediately
        finishTurn();
    }
    
    return true;
}

// Get flips from surrounded tiles rule
function getSurroundedFlips(attackingPlayer) {
    const defendingPlayer = attackingPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    const attackerZOC = calculateZOC(attackingPlayer);
    const defendingTiles = getPlayerTiles(defendingPlayer);
    
    const flips = [];
    
    for (const tile of defendingTiles) {
        if (isTileSurrounded(tile.q, tile.r, attackerZOC)) {
            flips.push({ q: tile.q, r: tile.r, distance: 1 });
            
            // Get tiles in straight lines from the surrounded tile
            const linesTiles = getTilesInStraightLines(tile.q, tile.r, defendingPlayer);
            linesTiles.forEach((lt, idx) => {
                flips.push({ q: lt.q, r: lt.r, distance: idx + 2 });
            });
        }
    }
    
    return flips;
}

// Animate tile flips in sequence by distance
function animateFlips(flips, newPlayer) {
    gameState.isAnimating = true;
    
    // Sort flips by distance
    flips.sort((a, b) => a.distance - b.distance);
    
    // Group flips by distance
    const flipsByDistance = new Map();
    flips.forEach(flip => {
        const dist = flip.distance;
        if (!flipsByDistance.has(dist)) {
            flipsByDistance.set(dist, []);
        }
        flipsByDistance.get(dist).push(flip);
    });
    
    // Get sorted distances
    const distances = Array.from(flipsByDistance.keys()).sort((a, b) => a - b);
    
    let delay = 0;
    const delayIncrement = 150; // ms between each distance level
    
    distances.forEach(dist => {
        const flipsAtDist = flipsByDistance.get(dist);
        setTimeout(() => {
            flipsAtDist.forEach(flip => {
                gameState.tiles.set(hexKey(flip.q, flip.r), newPlayer);
            });
            updateUI();
            render();
        }, delay);
        delay += delayIncrement;
    });
    
    // Finish turn after all animations
    setTimeout(() => {
        gameState.isAnimating = false;
        finishTurn();
    }, delay);
}

// Finish the turn after tile placement and flips
function finishTurn() {
    // Check for game over
    if (gameState.whiteTilesRemaining === 0 && gameState.blackTilesRemaining === 0) {
        gameState.gameOver = true;
        showGameOver();
    } else {
        // Switch players
        gameState.currentPlayer = gameState.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        updateUI();
        render();
    }
}

// Count tiles for each player
function countTiles() {
    let white = 0;
    let black = 0;
    
    gameState.tiles.forEach(player => {
        if (player === PLAYER.WHITE) white++;
        else black++;
    });
    
    return { white, black };
}

// Show game over modal
function showGameOver() {
    const scores = countTiles();
    const modal = document.getElementById('game-over');
    const winnerText = document.getElementById('winner-text');
    const finalScore = document.getElementById('final-score');
    
    if (scores.white > scores.black) {
        winnerText.textContent = 'White Wins!';
    } else if (scores.black > scores.white) {
        winnerText.textContent = 'Black Wins!';
    } else {
        winnerText.textContent = "It's a Tie!";
    }
    
    finalScore.textContent = `Final Score: White ${scores.white} - Black ${scores.black}`;
    modal.classList.remove('hidden');
}

// Reset the game
function resetGame() {
    const debugMode = gameState.debugMode; // Preserve debug mode
    gameState = {
        currentPlayer: PLAYER.WHITE,
        tiles: new Map(),
        whiteTilesRemaining: TILES_PER_PLAYER,
        blackTilesRemaining: TILES_PER_PLAYER,
        hoveredHex: null,
        lastPlacedTile: null,
        lastPlacedTime: 0,
        gameOver: false,
        debugMode: debugMode,
        animatingFlips: [],
        isAnimating: false
    };
    
    document.getElementById('game-over').classList.add('hidden');
    updateUI();
    render();
}

// Update UI elements
function updateUI() {
    const scores = countTiles();
    
    document.getElementById('white-tiles').textContent = gameState.whiteTilesRemaining;
    document.getElementById('black-tiles').textContent = gameState.blackTilesRemaining;
    document.getElementById('white-score').textContent = scores.white;
    document.getElementById('black-score').textContent = scores.black;
    
    const turnText = gameState.currentPlayer === PLAYER.WHITE ? "White's Turn" : "Black's Turn";
    document.getElementById('current-turn').textContent = turnText;
    
    // Update active panel styling
    document.getElementById('white-panel').classList.toggle('active', gameState.currentPlayer === PLAYER.WHITE);
    document.getElementById('black-panel').classList.toggle('active', gameState.currentPlayer === PLAYER.BLACK);
}

// Event Handlers
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hex = pixelToHex(x, y);
    
    if (isValidHex(hex.q, hex.r)) {
        gameState.hoveredHex = hex;
    } else {
        gameState.hoveredHex = null;
    }
    
    render();
}

function handleMouseLeave() {
    gameState.hoveredHex = null;
    render();
}

function handleClick(e) {
    if (gameState.gameOver) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const hex = pixelToHex(x, y);
    
    if (placeTile(hex.q, hex.r)) {
        updateUI();
        render();
    }
}

// Drawing Functions
function drawHexagon(x, y, size, fillColor, strokeColor, strokeWidth = 1) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (Math.PI / 3) * i;
        const hx = x + size * Math.cos(angle);
        const hy = y + size * Math.sin(angle);
        if (i === 0) {
            ctx.moveTo(hx, hy);
        } else {
            ctx.lineTo(hx, hy);
        }
    }
    ctx.closePath();
    
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
    }
}

function drawTile(x, y, player) {
    const tileRadius = HEX_SIZE * 0.7;
    
    // Shadow
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, tileRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();
    
    // Tile
    ctx.beginPath();
    ctx.arc(x, y, tileRadius, 0, Math.PI * 2);
    
    if (player === PLAYER.WHITE) {
        const gradient = ctx.createRadialGradient(x - tileRadius * 0.3, y - tileRadius * 0.3, 0, x, y, tileRadius);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#cccccc');
        ctx.fillStyle = gradient;
    } else {
        const gradient = ctx.createRadialGradient(x - tileRadius * 0.3, y - tileRadius * 0.3, 0, x, y, tileRadius);
        gradient.addColorStop(0, '#4a4a4a');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
    }
    ctx.fill();
    
    // Border
    ctx.strokeStyle = player === PLAYER.WHITE ? '#999' : '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw felt background
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvasWidth / 2);
    gradient.addColorStop(0, FELT_GREEN);
    gradient.addColorStop(1, FELT_DARK);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate ZOCs
    const whiteZOC = calculateZOC(PLAYER.WHITE);
    const blackZOC = calculateZOC(PLAYER.BLACK);
    
    // Should we show ZOC for recently placed tile?
    const showRecentZOC = gameState.lastPlacedTile && 
        (Date.now() - gameState.lastPlacedTime < ZOC_DISPLAY_DURATION);
    
    // Get all valid hexes
    const allHexes = getAllValidHexes();
    
    // Determine which hexes are in the hovered ZOC (7 hexes: tile cell + 6 surrounding)
    let hoveredZOCSet = new Set();
    let hoveredTilePlayer = null;
    if (gameState.hoveredHex && !gameState.gameOver) {
        const hoveredKey = hexKey(gameState.hoveredHex.q, gameState.hoveredHex.r);
        const hoveredTile = gameState.tiles.get(hoveredKey);
        
        if (hoveredTile) {
            // Hovering over a played tile - show its ZOC
            hoveredTilePlayer = hoveredTile;
        } else {
            // Hovering over empty hex - show current player's potential ZOC
            hoveredTilePlayer = gameState.currentPlayer;
        }
        
        const zocHexes = getZOCHexes(gameState.hoveredHex.q, gameState.hoveredHex.r);
        zocHexes.forEach(s => {
            if (isValidHex(s.q, s.r)) {
                hoveredZOCSet.add(hexKey(s.q, s.r));
            }
        });
    }
    
    // Determine which hexes are in the recently placed tile's ZOC (7 hexes)
    let recentZOCSet = new Set();
    if (showRecentZOC) {
        const zocHexes = getZOCHexes(gameState.lastPlacedTile.q, gameState.lastPlacedTile.r);
        zocHexes.forEach(s => {
            if (isValidHex(s.q, s.r)) {
                recentZOCSet.add(hexKey(s.q, s.r));
            }
        });
    }
    
    // Draw all hexes (base layer)
    for (const hex of allHexes) {
        const { x, y } = hexToPixel(hex.q, hex.r);
        drawHexagon(x, y, HEX_SIZE, 'rgba(0, 80, 0, 0.4)', 'rgba(0, 140, 0, 0.8)', 1);
    }
    
    // Draw ZOC highlighting on top
    if (hoveredZOCSet.size > 0) {
        const zocColor = hoveredTilePlayer === PLAYER.WHITE ? 
            'rgba(255, 255, 255, 0.6)' : 'rgba(40, 40, 40, 0.6)';
        const zocStroke = hoveredTilePlayer === PLAYER.WHITE ? 
            'rgba(255, 255, 255, 0.9)' : 'rgba(80, 80, 80, 0.9)';
        
        for (const hex of allHexes) {
            const key = hexKey(hex.q, hex.r);
            if (hoveredZOCSet.has(key)) {
                const { x, y } = hexToPixel(hex.q, hex.r);
                drawHexagon(x, y, HEX_SIZE, zocColor, zocStroke, 4);
            }
        }
    }
    
    // Draw recently placed tile ZOC (fading)
    if (showRecentZOC) {
        const opacity = 1 - (Date.now() - gameState.lastPlacedTime) / ZOC_DISPLAY_DURATION;
        const zocColor = gameState.lastPlacedTile.player === PLAYER.WHITE ? 
            `rgba(255, 255, 255, ${0.6 * opacity})` : `rgba(40, 40, 40, ${0.6 * opacity})`;
        const zocStroke = gameState.lastPlacedTile.player === PLAYER.WHITE ? 
            `rgba(255, 255, 255, ${0.9 * opacity})` : `rgba(80, 80, 80, ${0.9 * opacity})`;
        
        for (const hex of allHexes) {
            const key = hexKey(hex.q, hex.r);
            if (recentZOCSet.has(key) && !hoveredZOCSet.has(key)) {
                const { x, y } = hexToPixel(hex.q, hex.r);
                drawHexagon(x, y, HEX_SIZE, zocColor, zocStroke, 4);
            }
        }
    }
    
    // Draw hovered hex highlight (for empty hexes where player will place)
    if (gameState.hoveredHex && !gameState.gameOver) {
        const hoveredKey = hexKey(gameState.hoveredHex.q, gameState.hoveredHex.r);
        if (!gameState.tiles.has(hoveredKey)) {
            const { x, y } = hexToPixel(gameState.hoveredHex.q, gameState.hoveredHex.r);
            const fillColor = gameState.currentPlayer === PLAYER.WHITE ? 
                'rgba(255, 255, 255, 0.5)' : 'rgba(60, 60, 60, 0.6)';
            const strokeColor = gameState.currentPlayer === PLAYER.WHITE ? 
                'rgba(255, 255, 255, 1)' : 'rgba(120, 120, 120, 1)';
            drawHexagon(x, y, HEX_SIZE, fillColor, strokeColor, 3);
        }
    }
    
    // Draw tiles
    gameState.tiles.forEach((player, key) => {
        const [q, r] = key.split(',').map(Number);
        const { x, y } = hexToPixel(q, r);
        drawTile(x, y, player);
    });
    
    // Draw preview tile for hovered hex
    if (gameState.hoveredHex && !gameState.gameOver && !gameState.isAnimating) {
        const hoveredKey = hexKey(gameState.hoveredHex.q, gameState.hoveredHex.r);
        if (!gameState.tiles.has(hoveredKey)) {
            const { x, y } = hexToPixel(gameState.hoveredHex.q, gameState.hoveredHex.r);
            ctx.globalAlpha = 0.5;
            drawTile(x, y, gameState.currentPlayer);
            ctx.globalAlpha = 1;
        }
    }
    
    // Draw hex coordinates in debug mode (all cells, orange text)
    if (gameState.debugMode) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'orange';
        
        for (const hex of allHexes) {
            const { x, y } = hexToPixel(hex.q, hex.r);
            const coordText = `${hex.q}, ${hex.r}`;
            ctx.fillText(coordText, x, y + HEX_SIZE - 4);
        }
    }
}

// Animation loop for smooth ZOC fade
function gameLoop() {
    if (gameState.lastPlacedTile && 
        (Date.now() - gameState.lastPlacedTime < ZOC_DISPLAY_DURATION)) {
        render();
    }
    requestAnimationFrame(gameLoop);
}

// Start the game
document.addEventListener('DOMContentLoaded', () => {
    init();
    gameLoop();
});
