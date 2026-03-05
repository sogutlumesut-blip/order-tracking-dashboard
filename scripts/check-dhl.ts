import { db } from '../lib/prisma';
async function run() {
    const user = await db.systemSetting.findUnique({where: {key: 'dhl_user'}});
    const pass = await db.systemSetting.findUnique({where: {key: 'dhl_pass'}});
    console.log('User:', user?.value, 'Pass:', pass?.value);
}
run();
