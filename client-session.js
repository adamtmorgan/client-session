// External dependencies
import jwt from 'jsonwebtoken';

// Internal dependencies
import DeepProxy from './DeepProxy.js';

// SessionPayload Class -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

export class SessionPayload {
	// Fields
	#data;
	#issueToken;

	constructor(prevPayload, issueToken) {
		const self = this;

		this.#issueToken = (payload) => {
			issueToken(payload);
		};

		if (prevPayload !== undefined) {
			this.#data = prevPayload;
		} else {
			this.#data = {};
		}

		// Tracks object tree.
		// Generates new JWT and applies it to response cookie on property set.
		return new DeepProxy(this.#data, {
			set(_target, _key, _value, _receiver) {
				self.#issueToken(self.json());
			},

			deleteProperty(_target, _key) {
				self.#issueToken(self.json());
			},
		});
	}

	json() {
		return JSON.stringify(this.#data);
	}
}

// Main export for use as Express middleware -=-=-=-=-=-=-=-=-

export default class ClientSession {
	constructor(options) {
		this.secret = options.secret;
		this.expiresIn = options.expiresIn;
	}

	updateCookie(token, _req, res) {
		const cookieOptions = {
			expires: new Date(Date.now() + this.expiresIn),
			httpOnly: true,
		};
		res.cookie('accessToken', token, cookieOptions);
	}

	middleware(req, res, next) {
		const jwtOptions = {
			algorithm: 'HS256',
		};

		// Issues JWT if not already present.
		if (req.cookies.accessToken === undefined) {
			req.clientSession = new SessionPayload(undefined, (tokenPayload) => {
				const token = jwt.sign(
					{
						exp: Math.floor(Date.now() / 1000) + this.expiresIn,
						data: tokenPayload,
					},
					this.secret,
					jwtOptions
				);
				this.updateCookie(token, req, res);
			});
			return next();
		}

		// Verify token and apply it to the req object for use in routes.
		jwt.verify(req.cookies.accessToken, this.secret, (err, payload) => {
			if (err) {
				return res.sendStatus(403);
			}

			const tokenData = JSON.parse(payload.data);

			req.clientSession = new SessionPayload(tokenData, (tokenPayload) => {
				const token = jwt.sign(
					{
						exp: Math.floor(Date.now() / 1000) + this.expiresIn,
						data: tokenPayload,
					},
					this.secret,
					jwtOptions
				);
				this.updateCookie(token, req, res);
			});
			return next();
		});
	}
}
