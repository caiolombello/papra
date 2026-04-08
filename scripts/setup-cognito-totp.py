#!/usr/bin/env python3
"""Setup TOTP MFA for Cognito user.

Usage: python3 setup-cognito-totp.py
"""
import getpass
import hashlib
import hmac
import base64
import sys

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("pip install boto3 first")
    sys.exit(1)

try:
    import qrcode
except ImportError:
    qrcode = None

REGION = "sa-east-1"
USER_POOL_ID = "sa-east-1_0VR1WZEtK"
CLIENT_ID = "g09nk6roou4elribfk9sk4lo8"
AWS_PROFILE = "lombello"

# Check if client has a secret
session = boto3.Session(profile_name=AWS_PROFILE, region_name=REGION)
cognito = session.client("cognito-idp")
client_info = cognito.describe_user_pool_client(
    UserPoolId=USER_POOL_ID, ClientId=CLIENT_ID
)
CLIENT_SECRET = client_info["UserPoolClient"].get("ClientSecret")


def compute_secret_hash(username: str) -> str | None:
    if not CLIENT_SECRET:
        return None
    msg = username + CLIENT_ID
    dig = hmac.new(
        CLIENT_SECRET.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256
    ).digest()
    return base64.b64encode(dig).decode("utf-8")


def main():
    print("=== Cognito TOTP MFA Setup ===\n")
    username = input("Cognito username or email: ").strip()
    password = getpass.getpass("Cognito password: ")

    auth_params = {"USERNAME": username, "PASSWORD": password}
    secret_hash = compute_secret_hash(username)
    if secret_hash:
        auth_params["SECRET_HASH"] = secret_hash

    try:
        resp = cognito.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters=auth_params,
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "InvalidParameterException":
            # Try SRP
            print("USER_PASSWORD_AUTH not enabled, trying SRP...")
            try:
                import warrant
            except ImportError:
                print("\nUSER_PASSWORD_AUTH is not enabled on this client.")
                print("Enable it or use the AWS Console to set up MFA.")
                sys.exit(1)
        else:
            print(f"\nAuth failed: {e.response['Error']['Message']}")
            sys.exit(1)

    # Handle challenges
    if "ChallengeName" in resp:
        challenge = resp["ChallengeName"]
        session = resp["Session"]

        if challenge == "MFA_SETUP":
            # Associate TOTP
            assoc = cognito.associate_software_token(Session=session)
            secret_code = assoc["SecretCode"]
            session = assoc["Session"]
        else:
            print(f"Unexpected challenge: {challenge}")
            sys.exit(1)
    elif "AuthenticationResult" in resp:
        # Already authenticated, associate via access token
        access_token = resp["AuthenticationResult"]["AccessToken"]
        assoc = cognito.associate_software_token(AccessToken=access_token)
        secret_code = assoc["SecretCode"]
        session = None
    else:
        print("Unexpected response")
        sys.exit(1)

    # Show QR code
    otp_uri = f"otpauth://totp/Papra:{username}?secret={secret_code}&issuer=Papra"

    print(f"\n{'='*50}")
    print("Scan this in your authenticator app (Proton Pass, etc.):\n")

    if qrcode:
        qr = qrcode.QRCode(box_size=1, border=1)
        qr.add_data(otp_uri)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
    else:
        print(f"  OTP URI: {otp_uri}")
        print(f"  Secret:  {secret_code}")
        print("\n  (install 'qrcode' for QR: pip install qrcode)")

    print(f"\n{'='*50}")

    # Verify
    totp_code = input("\nEnter the 6-digit code from your authenticator: ").strip()

    try:
        if session:
            verify_resp = cognito.verify_software_token(
                Session=session, UserCode=totp_code, FriendlyDeviceName="Authenticator"
            )
        else:
            verify_resp = cognito.verify_software_token(
                AccessToken=access_token, UserCode=totp_code, FriendlyDeviceName="Authenticator"
            )

        if verify_resp["Status"] == "SUCCESS":
            print("\nTOTP verified!")

            # Enable MFA preference
            if session:
                print("MFA setup complete. It will be required on next login.")
            else:
                cognito.set_user_mfa_preference(
                    AccessToken=access_token,
                    SoftwareTokenMfaSettings={
                        "Enabled": True,
                        "PreferredMfa": True,
                    },
                )
                print("TOTP MFA is now ENABLED for your account.")
                print("Next login will require the authenticator code.")
        else:
            print(f"Verification failed: {verify_resp['Status']}")
    except ClientError as e:
        print(f"Verification failed: {e.response['Error']['Message']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
