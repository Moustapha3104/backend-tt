const request = require('supertest');
const app = require('../server');

describe('Loans API', () => {
    let gerantToken;
    let membreToken;

    // Helper: login and get token
    const login = async (email, password) => {
        const res = await request(app).post('/api/auth/login').send({ email, password });
        expect(res.statusCode).toEqual(200);
        return res.body.token;
    };

    beforeAll(async () => {
        gerantToken = await login('admin@tontine.sn', 'admin123');
    });

    // ─── GET /api/prets ───────────────────────────────────────────────────────
    describe('GET /api/prets', () => {
        it('should return loans list for authenticated gerant', async () => {
            const res = await request(app)
                .get('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body).toHaveProperty('stats');
        });

        it('should reject unauthenticated request', async () => {
            const res = await request(app).get('/api/prets');
            expect(res.statusCode).toEqual(401);
            expect(res.body.success).toBe(false);
        });
    });

    // ─── POST /api/prets ──────────────────────────────────────────────────────
    describe('POST /api/prets', () => {
        it('should create a loan request', async () => {
            const res = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 10000, motif: 'Test motif from jest' });

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.status).toBe('En attente');
            expect(res.body.data.montant).toBe(10000);
        });

        it('should fail if montant is missing', async () => {
            const res = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ motif: 'No amount' });

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
        });

        it('should fail if motif is missing', async () => {
            const res = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 10000 });

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
        });

        it('should reject a loan exceeding 30% of cagnotte', async () => {
            const res = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 99999999, motif: 'Huge loan' });

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/30%/);
        });
    });

    // ─── POST /api/prets/:id/approuver ────────────────────────────────────────
    describe('POST /api/prets/:id/approuver', () => {
        let createdPretId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 5000, motif: 'Approval test loan' });
            createdPretId = res.body.data?.id;
        });

        it('gerant should be able to submit first approval', async () => {
            if (!createdPretId) return;
            const res = await request(app)
                .post(`/api/prets/${createdPretId}/approuver`)
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            // Message should indicate 1/2 or final approval
            expect(res.body.message).toBeDefined();
        });

        it('should return 404 for a non-existent loan', async () => {
            const res = await request(app)
                .post('/api/prets/99999/approuver')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(404);
        });

        it('non-gerant should not be able to approve loans', async () => {
            // Register a temporary member user
            const regRes = await request(app).post('/api/auth/register').send({
                name: 'Test Membre', email: `test_${Date.now()}@test.sn`, password: 'password123'
            });
            const tempToken = regRes.body.token;

            const res = await request(app)
                .post(`/api/prets/${createdPretId}/approuver`)
                .set('Authorization', `Bearer ${tempToken}`);

            expect(res.statusCode).toEqual(403);
        });
    });

    // ─── POST /api/prets/:id/rejeter ──────────────────────────────────────────
    describe('POST /api/prets/:id/rejeter', () => {
        it('gerant should be able to reject a pending loan', async () => {
            // Create a fresh loan
            const createRes = await request(app)
                .post('/api/prets')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 5000, motif: 'To be rejected' });

            const pretId = createRes.body.data?.id;
            if (!pretId) return;

            const res = await request(app)
                .post(`/api/prets/${pretId}/rejeter`)
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/rejet/i);
        });
    });
});
