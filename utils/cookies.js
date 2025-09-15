import jwt from 'jsonwebtoken';

export const adminCookie = (jwt_secret, user, res, message) => {
    const expiresIn = 30 * 24 * 60 * 60 * 1000;
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email
        },
        jwt_secret,
        { expiresIn: '30d' }
    );

    const expiresAt = new Date(Date.now() + expiresIn);

    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    res.status(200)
        .cookie('admin_token', token, {
            httpOnly: true,
            maxAge: expiresIn,
            sameSite: 'none',
            secure: true
        })
        .json({
            status: true,
            message: message,
            user: {
                role: user.role_id || '',
                userid: user.id || '',
                profileimage: user.profile_picture || '',
                prefix: user.prefix || '',
                fmname: firstName,
                lmname: lastName,
                fullname: fullName,
                you_are_here: user.you_are_here || '',
                email: user.email || '',
                mobile: user.mobile || '',
                address_name: user.address_name || '',
                setcurrentcategory: '0',
                token: token,
                token_expires_at: expiresAt.toISOString()
            }
        });
};
