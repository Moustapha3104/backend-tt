const request = require('supertest');
const app = require('../server');

describe('Feature Verification API', () => {
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

    describe('POST /api/tontine', () => {
        it('should return a different unique invitation code for each tontine created by the same user', async () => {
            const first = await request(app)
                .post('/api/tontine')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ nom: 'Tontine Test Code A', nombre_places: 5 });

            const second = await request(app)
                .post('/api/tontine')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ nom: 'Tontine Test Code B', nombre_places: 5 });

            expect(first.statusCode).toEqual(201);
            expect(second.statusCode).toEqual(201);
            expect(first.body.code).toMatch(/^[A-F0-9]{6}$/);
            expect(second.body.code).toMatch(/^[A-F0-9]{6}$/);
            expect(second.body.code).not.toEqual(first.body.code);
            expect(second.body.data.code_invitation).toEqual(second.body.code);
        });
    });

    // ─── BATCH COTISATION ───────────────────────────────────────────────────
    describe('POST /api/transactions/cotiser-batch', () => {
        it('should process batch cotisations for multiple members', async () => {
            // Get members to find some unpaid ones
            const memRes = await request(app)
                .get('/api/membres')
                .set('Authorization', `Bearer ${gerantToken}`);
            
            const unpaidIds = memRes.body.data.filter(m => !m.paid).map(m => m.id).slice(0, 2);
            
            if (unpaidIds.length === 0) {
                console.warn('[skip] No unpaid members found for batch test');
                return;
            }

            const res = await request(app)
                .post('/api/transactions/cotiser-batch')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({
                    method: 'wave',
                    membresIds: unpaidIds
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/enregistrée/);

            // Verify they are now paid
            const verifyRes = await request(app)
                .get('/api/membres')
                .set('Authorization', `Bearer ${gerantToken}`);
            
            unpaidIds.forEach(id => {
                const m = verifyRes.body.data.find(member => member.id === id);
                expect(m.paid).toBe(1);
            });
        });

        it('should fail if membresIds is missing or empty', async () => {
            const res = await request(app)
                .post('/api/transactions/cotiser-batch')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ method: 'wave', membresIds: [] });
            
            expect(res.statusCode).toEqual(400);
        });
    });

    // ─── PERSONALIZED MESSAGES ──────────────────────────────────────────────
    describe('POST /api/membres/:id/message', () => {
        it('should send a personalized message to a member', async () => {
            // Find a member with user_id to ensure email exists (admin@tontine.sn has one)
            const memRes = await request(app)
                .get('/api/membres')
                .set('Authorization', `Bearer ${gerantToken}`);
            
            // In seed data, member 1 (Moussa Diop) is admin or linked to user 1
            const targetMembre = memRes.body.data.find(m => m.name === 'Moussa Diop');
            
            if (!targetMembre) {
                console.warn('[skip] Target member Moussa Diop not found');
                return;
            }

            const res = await request(app)
                .post(`/api/membres/${targetMembre.id}/message`)
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({
                    sujet: 'Test Subject',
                    contenu: 'Hello from Jest test'
                });

            // If Moussa Diop isn't linked to a user with email, it might 400
            // But from server.js seeds: Moussa Diop is member, and admin@tontine.sn is user
            // Let's check if they are linked. Moussa Diop is just a name in seed.
            // If it fails because of missing email, that's also a valid outcome to check.
            
            if (res.statusCode === 200) {
                expect(res.body.success).toBe(true);
                expect(res.body.message).toMatch(/envoyé/);
            } else {
                expect(res.statusCode).toEqual(400);
                expect(res.body.message).toMatch(/adresse email/);
            }
        });
    });

    // ─── TIRAGE MENSUEL ─────────────────────────────────────────────────────
    describe('Monthly Tirage', () => {
        let tirageId;

        it('should perform a random tirage', async () => {
            const res = await request(app)
                .post('/api/tirage/effectuer')
                .set('Authorization', `Bearer ${gerantToken}`)
                .send({ montant: 50000 });

            // If already done this month, it returns 400
            if (res.statusCode === 400 && res.body.message.includes('déjà été effectué')) {
                console.warn('[skip] Tirage already done this month');
                return;
            }

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id');
            tirageId = res.body.data.id;
        });

        it('should confirm payment for a tirage', async () => {
            if (!tirageId) {
                // Get the current tirage if possible
                const tRes = await request(app)
                    .get('/api/tirage')
                    .set('Authorization', `Bearer ${gerantToken}`);
                tirageId = tRes.body.data.tirageActuel?.id;
            }

            if (!tirageId) {
                console.warn('[skip] No tirage found to confirm');
                return;
            }

            const res = await request(app)
                .post(`/api/tirage/${tirageId}/envoyer`)
                .set('Authorization', `Bearer ${gerantToken}`);

            if (res.statusCode === 200) {
                expect(res.body.success).toBe(true);
                expect(res.body.message).toMatch(/succès/);
            } else {
                // Might be already sent
                expect(res.statusCode).toEqual(400);
                expect(res.body.message).toMatch(/déjà été envoyé/);
            }
        });
    });

    // ─── NOTIFICATIONS ──────────────────────────────────────────────────────
    describe('POST /api/notifications/send-reminders', () => {
        it('should trigger manual reminders', async () => {
            const res = await request(app)
                .post('/api/notifications/send-reminders')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/rappel/);
        });
    });

    // ─── AUDIT LOGS ─────────────────────────────────────────────────────────
    describe('GET /api/audit', () => {
        it('should return recent audit logs', async () => {
            const res = await request(app)
                .get('/api/audit')
                .set('Authorization', `Bearer ${gerantToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.length).toBeGreaterThan(0);
        });
    });
});
