package com.example.gpt.utils;

import android.app.Activity;
import androidx.annotation.NonNull;
import com.google.firebase.FirebaseException;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.PhoneAuthCredential;
import com.google.firebase.auth.PhoneAuthOptions;
import com.google.firebase.auth.PhoneAuthProvider;
import java.util.concurrent.TimeUnit;

public class PhoneAuthHelper {
    private final FirebaseAuth mAuth;
    private String mVerificationId;
    private PhoneAuthProvider.ForceResendingToken mResendToken;
    private final PhoneAuthCallback mCallback;

    public interface PhoneAuthCallback {
        void onVerificationSuccess(PhoneAuthCredential credential);
        void onVerificationFailed(String error);
        void onCodeSent(String verificationId, PhoneAuthProvider.ForceResendingToken token);
    }

    public PhoneAuthHelper(PhoneAuthCallback callback) {
        this.mAuth = FirebaseAuth.getInstance();
        this.mCallback = callback;
    }

    public void sendOTP(Activity activity, String phoneNumber) {
        if (!phoneNumber.startsWith("+")) {
            phoneNumber = "+91" + phoneNumber; // Default to India if no country code
        }

        PhoneAuthOptions options = PhoneAuthOptions.newBuilder(mAuth)
                .setPhoneNumber(phoneNumber)
                .setTimeout(60L, TimeUnit.SECONDS)
                .setActivity(activity)
                .setCallbacks(new PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                    @Override
                    public void onVerificationCompleted(@NonNull PhoneAuthCredential credential) {
                        mCallback.onVerificationSuccess(credential);
                    }

                    @Override
                    public void onVerificationFailed(@NonNull FirebaseException e) {
                        mCallback.onVerificationFailed(e.getMessage());
                    }

                    @Override
                    public void onCodeSent(@NonNull String verificationId,
                                           @NonNull PhoneAuthProvider.ForceResendingToken token) {
                        mVerificationId = verificationId;
                        mResendToken = token;
                        mCallback.onCodeSent(verificationId, token);
                    }
                })
                .build();
        PhoneAuthProvider.verifyPhoneNumber(options);
    }

    public void verifyOTP(String code, PhoneAuthCallback callback) {
        if (mVerificationId != null) {
            PhoneAuthCredential credential = PhoneAuthProvider.getCredential(mVerificationId, code);
            callback.onVerificationSuccess(credential);
        }
    }

    public void resendOTP(Activity activity, String phoneNumber) {
        if (mResendToken != null) {
            PhoneAuthOptions options = PhoneAuthOptions.newBuilder(mAuth)
                    .setPhoneNumber(phoneNumber)
                    .setTimeout(60L, TimeUnit.SECONDS)
                    .setActivity(activity)
                    .setCallbacks(new PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                        @Override
                        public void onVerificationCompleted(@NonNull PhoneAuthCredential credential) {
                            mCallback.onVerificationSuccess(credential);
                        }

                        @Override
                        public void onVerificationFailed(@NonNull FirebaseException e) {
                            mCallback.onVerificationFailed(e.getMessage());
                        }

                        @Override
                        public void onCodeSent(@NonNull String verificationId,
                                               @NonNull PhoneAuthProvider.ForceResendingToken token) {
                            mVerificationId = verificationId;
                            mResendToken = token;
                            mCallback.onCodeSent(verificationId, token);
                        }
                    })
                    .setForceResendingToken(mResendToken)
                    .build();
            PhoneAuthProvider.verifyPhoneNumber(options);
        }
    }
}
