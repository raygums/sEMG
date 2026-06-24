const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.gesture.findMany().then(g => console.log(g)).finally(() => prisma.$disconnect());
