import log from "@/next/log";
import type { SRPAttributes } from "@ente/accounts/types/srp";
import { Input, type ButtonProps } from "@mui/material";
import { t } from "i18next";
import SingleInputForm, {
    type SingleInputFormProps,
} from "../components/SingleInputForm";
import ComlinkCryptoWorker from "../crypto";
import { CustomError } from "../error";
import type { KeyAttributes, User } from "../user/types";

export interface VerifyMasterPasswordFormProps {
    user: User | undefined;
    keyAttributes: KeyAttributes | undefined;
    callback: (
        key: string,
        kek: string,
        keyAttributes: KeyAttributes,
        passphrase?: string,
    ) => void;
    buttonText: string;
    submitButtonProps?: ButtonProps;
    getKeyAttributes?: (kek: string) => Promise<KeyAttributes | undefined>;
    srpAttributes?: SRPAttributes;
}

export default function VerifyMasterPasswordForm({
    user,
    keyAttributes,
    srpAttributes,
    callback,
    buttonText,
    submitButtonProps,
    getKeyAttributes,
}: VerifyMasterPasswordFormProps) {
    const verifyPassphrase: SingleInputFormProps["callback"] = async (
        passphrase,
        setFieldError,
    ) => {
        try {
            const cryptoWorker = await ComlinkCryptoWorker.getInstance();
            let kek: string;
            try {
                if (srpAttributes) {
                    kek = await cryptoWorker.deriveKey(
                        passphrase,
                        srpAttributes.kekSalt,
                        srpAttributes.opsLimit,
                        srpAttributes.memLimit,
                    );
                } else if (keyAttributes) {
                    kek = await cryptoWorker.deriveKey(
                        passphrase,
                        keyAttributes.kekSalt,
                        keyAttributes.opsLimit,
                        keyAttributes.memLimit,
                    );
                } else
                    throw new Error("Both SRP and key attributes are missing");
            } catch (e) {
                log.error("failed to derive key", e);
                throw Error(CustomError.WEAK_DEVICE);
            }
            if (!keyAttributes && typeof getKeyAttributes === "function") {
                keyAttributes = await getKeyAttributes(kek);
            }
            if (!keyAttributes) {
                throw Error("couldn't get key attributes");
            }
            try {
                const key = await cryptoWorker.decryptB64(
                    keyAttributes.encryptedKey,
                    keyAttributes.keyDecryptionNonce,
                    kek,
                );
                callback(key, kek, keyAttributes, passphrase);
            } catch (e) {
                log.error("user entered a wrong password", e);
                throw Error(CustomError.INCORRECT_PASSWORD);
            }
        } catch (e) {
            if (e instanceof Error) {
                if (e.message === CustomError.TWO_FACTOR_ENABLED) {
                    // two factor enabled, user has been redirected to two factor page
                    return;
                }
                log.error("failed to verify passphrase", e);
                switch (e.message) {
                    case CustomError.WEAK_DEVICE:
                        setFieldError(t("WEAK_DEVICE"));
                        break;
                    case CustomError.INCORRECT_PASSWORD:
                        setFieldError(t("INCORRECT_PASSPHRASE"));
                        break;
                    default:
                        setFieldError(`${t("UNKNOWN_ERROR")} ${e.message}`);
                }
            }
        }
    };

    return (
        <SingleInputForm
            callback={verifyPassphrase}
            placeholder={t("password")}
            buttonText={buttonText}
            submitButtonProps={submitButtonProps}
            hiddenPreInput={
                <Input
                    sx={{ display: "none" }}
                    id="email"
                    name="email"
                    autoComplete="username"
                    type="email"
                    value={user?.email}
                />
            }
            autoComplete={"current-password"}
            fieldType="password"
        />
    );
}
