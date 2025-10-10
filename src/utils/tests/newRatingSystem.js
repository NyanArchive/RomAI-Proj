const { rating, rate } = require('openskill');
const { getRandomInt } = require('../osu/formatNum');

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
        const toElo = (r) => {
            // Base formula inspired by TrueSkill display rating
            // μ - 3σ gives conservative estimate of skill
            const base = (r.mu - 3 * r.sigma);
            return Math.round(1200 + (base - 10) * 40); // Adjust the multiplier (40) if range feels too narrow/wide
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
    }

};