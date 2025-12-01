const { rating, rate } = require('openskill');

module.exports = {
    /**
     * Calculates new ratings (mu/sigma) and displayELO.
     * @param {Array} eloP1 - Array of players {mu, sigma}
     * @param {Array} eloP2 - Array of players {mu, sigma}
     * @param {Array} score - [scoreTeam1, scoreTeam2]
     * @returns Updated player ratings and ELOs for both teams
    */
    async testEloSystem(eloP1, eloP2, score) {
        // Use OpenSkill to calculate new ratings
        const results = rate([eloP1, eloP2], { score: score });

        // Convert μ/σ → public ELO scale (roughly 1200–2000)
        const toElo = (mu, sigma) => {
            const base = mu - 3 * sigma; // conservative skill estimate
            return Math.round(1200 + (base - 10) * 40);
        };

        const mapPlayers = (arr, oldArr) =>
            arr.map((r, i) => {
                const newElo = toElo(r);
                const oldElo = toElo(oldArr[i]);
                return {
                    mu: r.mu,
                    sigma: r.sigma,
                    elo: newElo,
                    eloDiff: newElo - oldElo,
                };
            });

        // Map results
        const newT1 = mapPlayers(results[0], eloP1);
        const newT2 = mapPlayers(results[1], eloP2);

        console.log('Team 1:', newT1, '\nTeam 2:', newT2);

        return {
            team1: newT1,
            team2: newT2
        };
    },

    async simulateNewEloSystem() {
        // Helper: convert display ELO → OpenSkill (mu, sigma)
        function fromElo(elo) {
            const base = (elo - 1200) / 40 + 10;
            const sigma = 1.5;
            const mu = base + 3 * sigma;
            return { mu, sigma };
        }

        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // Generate 50 mock players
        const players = Array.from({ length: 50 }, (_, i) => {
            const globalRank = Math.floor(Math.random() * 10000) + 1;
            let elo;

            if (globalRank <= 1500) elo = 1800;
            else if (globalRank <= 5000) elo = 1700;
            else if (globalRank <= 7500) elo = 1600;
            else if (globalRank <= 30000) elo = 1500;
            else if (globalRank <= 70000) elo = 1400;
            else if (globalRank <= 150000) elo = 1300;
            else if (globalRank <= 300000) elo = 1200;
            else if (globalRank <= 500000) elo = 1100;
            else elo = 1000;

            const { mu, sigma } = fromElo(elo);

            return {
                id: i + 1,
                globalRank,
                elo,
                mu,
                sigma,
                startingELO: elo,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                eloHistory: []
            };
        });

        console.log("Initial Players:");
        console.table(players.map(p => ({
            id: p.id,
            globalRank: p.globalRank,
            startELO: p.startingELO,
            mu: p.mu.toFixed(2),
            sigma: p.sigma.toFixed(2)
        })));

        async function simulateMatches() {
            const totalGames = 5000;

            for (let g = 0; g < totalGames; g++) {
                const p1 = players[Math.floor(Math.random() * players.length)];
                const opponents = players.filter(p => Math.abs(p.elo - p1.elo) <= 150 && p.id !== p1.id);
                if (opponents.length === 0) continue;
                const p2 = opponents[Math.floor(Math.random() * opponents.length)];

                const score1 = getRandomInt(0, 4);
                const score2 = getRandomInt(0, 4);
                if (score1 === score2) continue;

                p1.gamesPlayed++;
                p2.gamesPlayed++;

                const team1Win = score1 > score2;
                if (team1Win) {
                    p1.wins++;
                    p2.losses++;
                } else {
                    p2.wins++;
                    p1.losses++;
                }

                // Store previous ELO for gain/loss calc
                const oldElo1 = p1.elo;
                const oldElo2 = p2.elo;

                const result = await module.exports.testEloSystem([p1], [p2], [score1, score2]);

                Object.assign(p1, result.team1[0]);
                Object.assign(p2, result.team2[0]);

                // Save ELO gain/loss for this match
                p1.eloHistory.push(p1.elo - oldElo1);
                p2.eloHistory.push(p2.elo - oldElo2);
            }

            players.sort((a, b) => b.elo - a.elo);

            console.log("\nFinal ELO leaderboard after simulation:");
            console.table(players.map(p => {
                const earlyGames = p.eloHistory.slice(0, 5);
                const lateGames = p.eloHistory.slice(-5);
                const avgEarly = earlyGames.length ? (earlyGames.reduce((a, b) => a + b, 0) / earlyGames.length).toFixed(2) : "N/A";
                const avgLate = lateGames.length ? (lateGames.reduce((a, b) => a + b, 0) / lateGames.length).toFixed(2) : "N/A";

                return {
                    id: p.id,
                    startingELO: p.startingELO,
                    finalELO: p.elo.toFixed(0),
                    gamesPlayed: p.gamesPlayed,
                    wins: p.wins,
                    losses: p.losses,
                    avgEloChangeFirst5: avgEarly,
                    avgEloChangeLast5: avgLate,
                    mu: p.mu.toFixed(2),
                    sigma: p.sigma.toFixed(2)
                };
            }));
        }

        await simulateMatches();
    },

    /**
     * Calculate placement ELO change.
     * @param {number} rating - Player's current ELO.
     * @param {number} opponentRating - Opponent's ELO.
     * @param {[number, number]} score - [playerScore, opponentScore].
     * @returns {Promise<number>} New ELO after match.
     */
    async calculatePlacementElo(rating, opponentRating, score) {
        let kFactor = 50;

        const [playerScore, opponentScore] = score;
        const win = playerScore > opponentScore;

        const diff = Math.abs(Math.min(playerScore, 4) - Math.min(opponentScore, 4));
        kFactor += Math.min(100, diff * 10);

        console.log(`K-Factor: ${kFactor}`);

        const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
        const actual = win ? 1 : 0;

        const newRating = rating + kFactor * (actual - expected);
        return Math.round(newRating) > 1800 && Math.abs(Math.round(newRating) - rating) > 24 ?
            rating + 24 :
            Math.round(newRating);
    },

    async simulatePlacementElo() { 
        // test 1 - 5 digit player in 1800 ELO range
        let currentElo = 1500;
        let matches;

        matches = [
            { opponentElo: 1500, score: [4, 0] },
            { opponentElo: 1600, score: [4, 0] },
            { opponentElo: 1450, score: [4, 0] },
            { opponentElo: 1580, score: [4, 0] },
            { opponentElo: 1690, score: [4, 0] },
        ];

        for (const match of matches) {
            currentElo = await module.exports.calculatePlacementElo(currentElo, match.opponentElo, match.score);
            console.log(`[Test 1] New ELO after match vs ${match.opponentElo} (score: ${match.score}): ${currentElo}`);
        }

        console.log(`[Test 1] Final ELO after 5 matches: ${currentElo}\n=====\n`);

        // test 2 - Top player starting at 1800 ELO
        currentElo = 1800;
        matches = [
            { opponentElo: 1750, score: [5, 0] },
            { opponentElo: 1850, score: [5, 0] },
            { opponentElo: 1900, score: [5, 0] },
            { opponentElo: 1800, score: [5, 0] },
            { opponentElo: 1888, score: [5, 0] },
        ];

        for (const match of matches) {
            currentElo = await module.exports.calculatePlacementElo(currentElo, match.opponentElo, match.score);
            console.log(`[Test 2] New ELO after match vs ${match.opponentElo} (score: ${match.score}): ${currentElo}`);
        }

        console.log(`[Test 2] Final ELO after 5 matches: ${currentElo}\n=====\n`);


        // test 3 - Mid-tier player starting at 1400 ELO
        currentElo = 1400;
        matches = [
            { opponentElo: 1450, score: [4, 2] },
            { opponentElo: 1380, score: [4, 0] },
            { opponentElo: 1580, score: [2, 4] },
            { opponentElo: 1543, score: [4, 3] },
            { opponentElo: 1600, score: [1, 4] },
        ];

        for (const match of matches) {
            currentElo = await module.exports.calculatePlacementElo(currentElo, match.opponentElo, match.score);
            console.log(`[Test 3] New ELO after match vs ${match.opponentElo} (score: ${match.score}): ${currentElo}`);
        }

        console.log(`[Test 3] Final ELO after 5 matches: ${currentElo}\n=====\n`);

        // test 4 - Top player (bad at tourneys) starting at 1800 ELO
        currentElo = 1800;
        matches = [
            { opponentElo: 1750, score: [2, 5] },
            { opponentElo: 1850, score: [0, 5] },
            { opponentElo: 1800, score: [0, 5] },
            { opponentElo: 1700, score: [3, 5] },
            { opponentElo: 1760, score: [1, 5] },
        ];

        for (const match of matches) {
            currentElo = await module.exports.calculatePlacementElo(currentElo, match.opponentElo, match.score);
            console.log(`[Test 4] New ELO after match vs ${match.opponentElo} (score: ${match.score}): ${currentElo}`);
        }

        console.log(`[Test 4] Final ELO after 5 matches: ${currentElo}\n=====\n`);
    }
};