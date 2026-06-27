const request = require('supertest');
const app = require('../src/server');

describe('Penalties & Members API', () => {
    let gerantToken;

    // Helper: login
    const login = async (email, password) => {
        const res = await request(app).post('/api/auth/login').send({ email, password });
        expect(res.statusCode).toEqual(200);
        return res.body.token;
    };

    beforeAll(async () => {
        gerantToken = await login('admin@tontine.sn', 'admin123');
    });

    // ─── GET /api/membres ─────────────────────────────────────────────────────
    describe('GET /api/membres', () => {
        it('should return members list with stats', async () => {
            const res = await request(app)
                .get('/api/membres')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.stats).toHaveProperty('total');
            expect(res.body.stats).toHaveProperty('payes');
            expect(res.body.stats).toHaveProperty('enAttente');
        });

        it('should reject unauthenticated request', async () => {
            const res = await request(app).get('/api/membres');
            expect(res.statusCode).toEqual(401);
        });
    });

    // ─── GET /api/membres/me/dashboard ─────────────────────────────────────────
    describe('GET /api/membres/me/dashboard', () => {
        it('should return 404 for a user not linked to a membre', async () => {
            // Register a fresh user not linked to any membre
            const regRes = await request(app).post('/api/auth/register').send({
                name: 'Standalone User', email: `standalone_${Date.now()}@test.sn`, password: 'password123'
            });
            const tempToken = regRes.body.token;

            const res = await request(app)
                .get('/api/membres/me/dashboard')
                .set('Authorization', `Bearer ${tempToken}`);

            // User has no membre record, should 404
            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
        });

        it('should require authentication', async () => {
            const res = await request(app).get('/api/membres/me/dashboard');
            expect(res.statusCode).toEqual(401);
        });
    });

    // ─── POST /api/membres/:id/appliquer-penalite ─────────────────────────────
    describe('POST /api/membres/:id/appliquer-penalite', () => {
        let unpaidMembreId;

        beforeAll(async () => {
            const res = await request(app)
                .get('/api/membres')
                .set('Authorization', `Bearer ${gerantToken}`);
            // Find an unpaid member to test penalty on
            const unpaid = res.body.data.find(m => !m.paid);
            unpaidMembreId = unpaid?.id;
        });

        it('gerant should be able to apply a penalty to unpaid member', async () => {
            if (!unpaidMembreId) {
                console.warn('[skip] No unpaid member found for penalty test');
                return;
            }

            const res = await request(app)
                .post(`/api/membres/${unpaidMembreId}/appliquer-penalite`)
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/[Pp]énalité/);
            expect(typeof res.body.data).toBe('number');
            expect(res.body.data).toBeGreaterThan(0);
        });

        it('should return 404 when applying penalty to non-existent member', async () => {
            const res = await request(app)
                .post('/api/membres/999999/appliquer-penalite')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(404);
        });

        it('non-gerant should not be able to apply penalties', async () => {
            const regRes = await request(app).post('/api/auth/register').send({
                name: 'Penalty Block', email: `penblock_${Date.now()}@test.sn`, password: 'password123'
            });
            const tempToken = regRes.body.token;

            const res = await request(app)
                .post(`/api/membres/1/appliquer-penalite`)
                .set('Authorization', `Bearer ${tempToken}`);

            expect(res.statusCode).toEqual(403);
        });
    });

    // ─── GET /api/tontine ─────────────────────────────────────────────────────
    describe('GET /api/tontine', () => {
        it('should return tontine data', async () => {
            const res = await request(app)
                .get('/api/tontine')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('cagnotte');
            expect(res.body.data).toHaveProperty('tour_actuel');
            expect(res.body.data).toHaveProperty('cotisation_mensuelle');
        });
    });

    // ─── GET /api/transactions ───────────────────────────────────────────────
    describe('GET /api/transactions', () => {
        it('should return transactions with financial stats', async () => {
            const res = await request(app)
                .get('/api/transactions')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.stats).toHaveProperty('totalCollecte');
            expect(res.body.stats).toHaveProperty('totalDecaisse');
            expect(res.body.stats).toHaveProperty('enCaisse');
        });
    });
});
