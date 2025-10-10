const mongoose = require('mongoose');

const osuUser = require('../../schemas/osuUser');

module.exports = {
    async authSingleUser() {
        /*
        let osuUserProfile = await new osuUser({
            _id: new mongoose.Types.ObjectId(),
            osuUserId: [id],
            osuUserName: '[username]',
            discordId: '[id]',
            ilRegion: 'no-region',
        });
        await osuUserProfile.save();

        console.log(osuUserProfile);
        */
    }
};