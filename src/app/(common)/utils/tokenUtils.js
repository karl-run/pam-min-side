import {Issuer} from "openid-client";
import logger from "@/app/(common)/utils/logger";
import {createRemoteJWKSet, jwtVerify} from "jose";

let issuer;
let idPortenIssuer;
let client;
let remoteJWKSet;


async function getIssuer() {
    if(issuer == null) {
        issuer = await Issuer.discover(process.env.TOKEN_X_WELL_KNOWN_URL);
    }
    return issuer;
}

async function getIdPortenIssuer() {
    if(idPortenIssuer == null) {
        idPortenIssuer = await Issuer.discover(process.env.IDPORTEN_WELL_KNOWN_URL);
    }
    return idPortenIssuer;

}
async function getClient() {
   if(client) return client;

   let issuer = await getIssuer();

    client = await new issuer.Client(
        {
            client_id: process.env.TOKEN_X_CLIENT_ID,
            token_endpoint_auth_method: "private_key_jwt",
            token_endpoint_auth_signing_alg: "RS256",
        },
        {
            keys: [JSON.parse(process.env.TOKEN_X_PRIVATE_JWK)],
        }
    )

    return client;
}

const getRemoteJWKSet = () => {
    if(remoteJWKSet) {
        return remoteJWKSet;
    }

    const jwksUrl = new URL(process.env.IDPORTEN_JWKS_URI);
    remoteJWKSet = createRemoteJWKSet(jwksUrl);

    return remoteJWKSet;
};
export async function isTokenValid(token) {
    try {
        const jwkSet = getRemoteJWKSet();
        const idissuer = await getIdPortenIssuer();

        const verification = await jwtVerify(token, jwkSet, {
            audience: process.env.IDPORTEN_AUDIENCE,
            issuer: idissuer.metadata.issuer,
        });
        return !!verification.payload;
    } catch (e) {
        logger.error(`Det skjedde en feil under validering av token, ${e.message}`);
        return false;
    }
}

export const grant = async (accessToken, tokenAudience) => {
    let tokenSet;
    client = await getClient();

    const additionalClaims = {
        clientAssertionPayload: {
            aud: client.issuer.metadata.token_endpoint,
            nbf: Math.floor(Date.now() / 1000),
        },
    };

    try {
        tokenSet = await client.grant(
            {
                grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
                client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
                audience: tokenAudience,
                subject_token: accessToken,
            },
            additionalClaims,
        );

    } catch (e) {
        let error =
             {
                errorType: 'OIDC_OP_RP_ERROR',
                message: createOidcUnknownError(e),
                error: e,
            }

        logger.error(`Kunne ikke veksle inn token: ${error.message}`);
    }

    return tokenSet.access_token;
}

const createOidcUnknownError = (err) =>
    `Noe gikk galt med token exchange mot TokenX. 
     Feilmelding fra openid-client: (${err}). 
     HTTP Status fra TokenX: (${err.response?.statusCode} ${err.response?.statusMessage})
     Body fra TokenX: ${JSON.stringify(err.response?.body)}`
