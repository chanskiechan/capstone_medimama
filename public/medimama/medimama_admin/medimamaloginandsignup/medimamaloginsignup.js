// ===============================
// SHOW / HIDE PASSWORD
// ===============================

function showFeedback(id, message, type = "error") {
    const feedback = document.getElementById(id);
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `form-feedback show ${type}`;
}

function clearFeedback(id) {
    const feedback = document.getElementById(id);
    if (feedback) feedback.className = "form-feedback";
}

function isStrongPassword(value) {
    return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

const pendingApprovalKey = 'medimama-pending-approvals';
const accountsKey = 'medimama-accounts';
const sessionKey = 'medimama-current-session';

function getAccounts() {
    try { return JSON.parse(localStorage.getItem(accountsKey)) || []; } catch { return []; }
}

function saveAccounts(accounts) {
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

function savePendingRegistration(accountType) {
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const linkedPatient = document.getElementById("linkedPatient")?.value.trim();
    const relationship = document.getElementById("relationship")?.value;
    const relationshipOther = document.getElementById("relationshipOther")?.value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const type = accountType === "caregiver" ? "Caregiver" : "Mother";
    const details = accountType === "caregiver"
        ? `${relationship} · linked to ${linkedPatient}`
        : "Maternal account registration";
    const accountId = `account-${Date.now()}`;
    const accounts = getAccounts();
    accounts.push({
        id: accountId,
        name: `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim(),
        email: email.toLowerCase(),
        password: document.getElementById("signupPassword").value,
        role: accountType,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    saveAccounts(accounts);

    const request = {
        id: `approval-${Date.now()}`,
        accountId,
        name: `${firstName} ${lastName}`,
        type,
        details,
        submitted: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())
    };

    if (accountType === "caregiver") {
        const relationshipLabel = relationship === "not-related" ? `Other (not related): ${relationshipOther}` : relationship;
        request.details = `${relationshipLabel} - linked to ${linkedPatient}`;
        request.relationship = relationshipLabel;
        request.linkedPatient = linkedPatient;
        request.motherContacted = false;
    }
    request.email = email;

    try {
        const existing = JSON.parse(localStorage.getItem(pendingApprovalKey)) || [];
        existing.unshift(request);
        localStorage.setItem(pendingApprovalKey, JSON.stringify(existing));
    } catch (error) {
        console.warn("Unable to save the pending registration locally.", error);
    }
}

function togglePasswordVisibility(button, input) {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(isHidden));
    const icon = button.querySelector("i");
    icon.classList.toggle("fa-eye", !isHidden);
    icon.classList.toggle("fa-eye-slash", isHidden);
}

const togglePassword = document.getElementById("togglePassword");
const password = document.getElementById("password");

if (togglePassword && password) {

    togglePassword.addEventListener("click", () => {

        togglePasswordVisibility(togglePassword, password);

    });

}


// ===============================
// LOGIN FORM VALIDATION
// ===============================

const form = document.getElementById("loginForm");

if (form) {

form.addEventListener("submit", function (e) {

    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = password.value.trim();

    if (email === "") {

        showFeedback("loginFeedback", "Please enter your email.");
        return;

    }

    if (!validateEmail(email)) {

        showFeedback("loginFeedback", "Please enter a valid email address.");
        return;

    }

    if (pass === "") {

        showFeedback("loginFeedback", "Please enter your password.");
        return;

    }

    if (!isStrongPassword(pass)) {

        showFeedback("loginFeedback", "Password must have at least 8 characters, including uppercase, lowercase, a number, and a special character.");
        return;

    }

    const normalizedEmail = email.toLowerCase();
    const demoAdmin = normalizedEmail === 'admin@medimama.test' && pass === 'Admin123!';
    const account = getAccounts().find(item => item.email === normalizedEmail);
    if (!demoAdmin && !account) {
        showFeedback("loginFeedback", "No account was found for that email. Please register first.");
        return;
    }
    if (!demoAdmin && account.status === 'pending') {
        showFeedback("loginFeedback", "Your registration is still pending administrator approval.");
        return;
    }
    if (!demoAdmin && account.status === 'declined') {
        showFeedback("loginFeedback", "This registration was not approved. Please contact your barangay health center.");
        return;
    }
    if (!demoAdmin && account.password !== pass) {
        showFeedback("loginFeedback", "Incorrect password. Please try again.");
        return;
    }
    const session = demoAdmin
        ? { name: 'MediMama Administrator', email: normalizedEmail, role: 'admin' }
        : { id: account.id, name: account.name, email: account.email, role: account.role };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    showFeedback("loginFeedback", "Login successful. Opening your dashboard…", "success");
    const destination = session.role === 'admin' ? '../dashboard/dashboardadmin.html'
        : session.role === 'caregiver' ? '../../medimama_user/caregiver/caregiver-dashboard.html'
        : '../../medimama_user/dashboard/userdashboard.html';
    setTimeout(() => { window.location.href = destination; }, 500);

});

}


// ===============================
// EMAIL VALIDATION
// ===============================

function validateEmail(email) {

    const pattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return pattern.test(email);

}


// ===============================
// ENTER KEY SUPPORT
// ===============================

document.addEventListener("keydown", function (e) {

    if (e.key === "Enter" && form && e.target.closest("#loginForm")) {

        form.requestSubmit();

    }

});


// ===============================
// FORM TOGGLE (LOGIN / SIGNUP)
// ===============================

const loginCard = document.querySelector(".login-card");
const signupCard = document.getElementById("signupCard");
const showSignupLink = document.getElementById("showSignup");
const showLoginLink = document.getElementById("showLogin");
const accountTypeInputs = document.querySelectorAll('input[name="accountType"]');
const caregiverFields = document.getElementById("caregiverFields");
const signupIntro = document.getElementById("signupIntro");
const relationshipInput = document.getElementById("relationship");
const relationshipOtherWrap = document.getElementById("relationshipOtherWrap");
const relationshipOtherInput = document.getElementById("relationshipOther");

function updateAccountType() {
    const accountType = document.querySelector('input[name="accountType"]:checked')?.value || "mother";
    const isCaregiver = accountType === "caregiver";

    caregiverFields.hidden = !isCaregiver;
    if (!isCaregiver && relationshipOtherInput) {
        relationshipOtherWrap.hidden = true;
        relationshipOtherInput.required = false;
    }
    signupIntro.textContent = isCaregiver
        ? "Provide your details to support a linked mother or infant"
        : "Fill in your details to register as a mother";

    accountTypeInputs.forEach(input => {
        input.closest(".account-type-option").classList.toggle("selected", input.checked);
    });
}

accountTypeInputs.forEach(input => input.addEventListener("change", updateAccountType));
relationshipInput?.addEventListener("change", () => {
    const isNotRelated = relationshipInput.value === "not-related";
    relationshipOtherWrap.hidden = !isNotRelated;
    relationshipOtherInput.required = isNotRelated;
    if (!isNotRelated) relationshipOtherInput.value = "";
});

if (showSignupLink) {
    showSignupLink.addEventListener("click", (e) => {
        e.preventDefault();
        loginCard.style.display = "none";
        signupCard.style.display = "block";
    });
}

if (showLoginLink) {
    showLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        signupCard.style.display = "none";
        loginCard.style.display = "block";
    });
}

// ===============================
// SIGNUP FORM VALIDATION
// ===============================

const signupForm = document.getElementById("signupForm");

if (signupForm) {

signupForm.addEventListener("submit", function (e) {

    e.preventDefault();
    clearFeedback("signupFeedback");

    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const addressDetails = document.getElementById("addressDetails").value.trim();
    const birthdate = document.getElementById("birthdate").value;
    const contactNumber = document.getElementById("contactNumber").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const validId = document.getElementById("validId").files;
    const password = document.getElementById("signupPassword").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    const termsCheckbox = document.getElementById("termsCheckbox").checked;
    const accountType = document.querySelector('input[name="accountType"]:checked')?.value || "mother";

    if (getAccounts().some(account => account.email === email.toLowerCase())) {
        showFeedback("signupFeedback", "An account with this email already exists. Please log in or use another email.");
        return;
    }

    if (firstName === "") {
        showFeedback("signupFeedback", "Please enter your first name.");
        return;
    }

    if (lastName === "") {
        showFeedback("signupFeedback", "Please enter your last name.");
        return;
    }

    if (addressDetails === "") {
        showFeedback("signupFeedback", "Please enter your house number, street, subdivision, or landmark.");
        return;
    }

    if (birthdate === "") {
        showFeedback("signupFeedback", "Please select your birthdate.");
        return;
    }

    if (contactNumber === "") {
        showFeedback("signupFeedback", "Please enter your contact number.");
        return;
    }

    if (!/^9\d{9}$/.test(contactNumber)) {
        showFeedback("signupFeedback", "Enter a valid Philippine mobile number: 9 followed by 9 digits.");
        return;
    }

    if (!validateEmail(email)) {
        showFeedback("signupFeedback", "Please enter a valid email address.");
        return;
    }

    if (validId.length === 0) {
        showFeedback("signupFeedback", "Please upload a valid ID.");
        return;
    }

    if (accountType === "caregiver") {
        const relationship = document.getElementById("relationship").value;
        const linkedPatient = document.getElementById("linkedPatient").value.trim();
        const emergencyContact = document.getElementById("emergencyContact").value.trim();
        const idType = document.getElementById("idType").value;
        const caregiverConsent = document.getElementById("caregiverConsent").checked;

        if (relationship === "") {
            showFeedback("signupFeedback", "Please select your relationship to the patient.");
            return;
        }

        if (relationship === "not-related" && document.getElementById("relationshipOther").value.trim() === "") {
            showFeedback("signupFeedback", "Please describe your connection to the mother or infant.");
            return;
        }

        if (linkedPatient === "") {
            showFeedback("signupFeedback", "Please enter the mother or infant you will support.");
            return;
        }

        if (emergencyContact === "") {
            showFeedback("signupFeedback", "Please enter an emergency contact number.");
            return;
        }

        if (!/^9\d{9}$/.test(emergencyContact)) {
            showFeedback("signupFeedback", "Enter a valid emergency contact number: 9 followed by 9 digits.");
            return;
        }

        if (idType === "") {
            showFeedback("signupFeedback", "Please select the type of valid ID you are submitting.");
            return;
        }

        if (!caregiverConsent) {
            showFeedback("signupFeedback", "Please confirm that caregiver access requires approval.");
            return;
        }
    }

    if (password === "") {
        showFeedback("signupFeedback", "Please create a password.");
        return;
    }

    if (!isStrongPassword(password)) {
        showFeedback("signupFeedback", "Password must have at least 8 characters, including uppercase, lowercase, a number, and a special character.");
        return;
    }

    if (confirmPassword !== password) {
        showFeedback("signupFeedback", "Passwords do not match.");
        return;
    }

    // Check if OTP is verified
    if (document.getElementById("signupEmail").getAttribute("data-verified") !== "true") {
        showFeedback("signupFeedback", "Please verify your email with OTP first.");
        return;
    }

    if (!termsCheckbox) {
        showFeedback("signupFeedback", "Please agree to the Terms and Privacy Policy.");
        return;
    }

    savePendingRegistration(accountType);
    showApprovalModal(accountType);

});

}

// ===============================
// REGISTRATION APPROVAL POP-UP
// ===============================

const approvalModal = document.getElementById("approvalModal");
const approvalClose = document.getElementById("approvalClose");

function showApprovalModal(accountType = "mother") {
    if (!approvalModal) return;
    document.getElementById("approvalTitle").textContent = `${accountType === "caregiver" ? "Caregiver" : "Mother"} Registration Submitted`;
    const isCaregiver = accountType === "caregiver";
    document.getElementById("approvalMessage").textContent = isCaregiver
        ? "Your caregiver request is pending verification. The administrator will first contact the linked mother before making a decision."
        : "Your account request has been sent to the administrator for approval.";
    document.getElementById("approvalEmailMessage").textContent = "Please wait for an email confirmation once the request is approved or declined.";
    approvalModal.classList.add("show");
    approvalModal.setAttribute("aria-hidden", "false");
}

if (approvalClose) {
    approvalClose.addEventListener("click", () => {
        approvalModal.classList.remove("show");
        approvalModal.setAttribute("aria-hidden", "true");
        signupForm.reset();
        relationshipOtherWrap.hidden = true;
        relationshipOtherInput.required = false;
        updateAccountType();
        signupCard.style.display = "none";
        loginCard.style.display = "block";
    });
}

// ===============================
// FILE UPLOAD HANDLER
// ===============================

const fileInput = document.getElementById("validId");
const fileName = document.getElementById("fileName");

if (fileInput) {
    fileInput.addEventListener("change", function () {
        if (this.files.length > 0) {
            fileName.textContent = this.files[0].name;
        } else {
            fileName.textContent = "No file selected";
        }
    });
}

document.querySelectorAll('#contactNumber, #emergencyContact').forEach(phone => {
    phone?.addEventListener('input', () => {
        phone.value = phone.value.replace(/\D/g, '').replace(/^63/, '').slice(0, 10);
    });
});

// ===============================
// OTP SEND HANDLER (NEW FLOW)
// ===============================

const sendOtpBtn = document.getElementById("sendOtpBtn");
const signupEmailInput = document.getElementById("signupEmail");
const otpVerificationSection = document.getElementById("otpVerificationSection");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const otpInput = document.getElementById("otp");
const otpFeedback = document.getElementById("otpFeedback");
let demoOtp = '';

function resetOtpVerification() {
    demoOtp = '';
    signupEmailInput?.removeAttribute('data-verified');
    if (otpInput) { otpInput.disabled = false; otpInput.value = ''; }
    if (verifyOtpBtn) verifyOtpBtn.disabled = false;
    if (otpVerificationSection) otpVerificationSection.style.display = 'none';
}

if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", function (e) {
        e.preventDefault();
        const email = signupEmailInput.value.trim();

        if (!validateEmail(email)) {
            showFeedback("signupFeedback", "Please enter a valid email address before requesting an OTP.");
            return;
        }

        demoOtp = String(Math.floor(100000 + Math.random() * 900000));
        signupEmailInput.removeAttribute('data-verified');
        // Show OTP verification section
        otpVerificationSection.style.display = "block";
        otpInput.value = "";
        otpFeedback.textContent = "";
        otpFeedback.className = "";
        
        document.getElementById('otpMessage').textContent = `Demo OTP sent to ${email}`;
        showFeedback("signupFeedback", `Demo mode: use OTP ${demoOtp} to continue. A real email service will replace this in the backend.`, "success");
    });
}

// ===============================
// OTP VERIFICATION HANDLER
// ===============================

if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", function (e) {
        e.preventDefault();
        const enteredOtp = otpInput.value.trim();

        if (enteredOtp === "") {
            otpFeedback.textContent = "Please enter the OTP.";
            otpFeedback.className = "otp-feedback error";
            return;
        }

        if (enteredOtp.length !== 6) {
            otpFeedback.textContent = "OTP must be 6 digits.";
            otpFeedback.className = "otp-feedback error";
            return;
        }

        if (enteredOtp === demoOtp) {
            otpFeedback.textContent = "✓ OTP verified successfully!";
            otpFeedback.className = "otp-feedback success";
            
            // Mark email as verified for form submission
            signupEmailInput.setAttribute("data-verified", "true");
            
            // Disable further OTP changes
            otpInput.disabled = true;
            verifyOtpBtn.disabled = true;
            
            setTimeout(() => {
                otpFeedback.textContent = "";
            }, 3000);
        } else {
            otpFeedback.textContent = "✗ Invalid OTP. Please try again.";
            otpFeedback.className = "otp-feedback error";
        }
    });
}

signupEmailInput?.addEventListener('input', resetOtpVerification);

// ===============================
// SIGNUP PASSWORD TOGGLE
// ===============================

const toggleSignupPassword = document.getElementById("toggleSignupPassword");
const signupPassword = document.getElementById("signupPassword");
const passwordHint = document.getElementById("passwordHint");

signupPassword?.addEventListener("input", () => {
    if (!signupPassword.value) {
        passwordHint.textContent = "At least 8 characters, with uppercase, lowercase, number, and special character.";
        passwordHint.className = "password-hint";
        return;
    }
    const valid = isStrongPassword(signupPassword.value);
    passwordHint.textContent = valid
        ? "Password meets all security requirements."
        : "Use 8+ characters with uppercase, lowercase, number, and special character.";
    passwordHint.className = `password-hint ${valid ? "valid" : "invalid"}`;
});

if (toggleSignupPassword && signupPassword) {
    toggleSignupPassword.addEventListener("click", () => {
        togglePasswordVisibility(toggleSignupPassword, signupPassword);
    });
}

const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");

if (toggleConfirmPassword && confirmPasswordInput) {
    toggleConfirmPassword.addEventListener("click", () => {
        togglePasswordVisibility(toggleConfirmPassword, confirmPasswordInput);
    });
}

document.getElementById('forgotPassword')?.addEventListener('click', event => {
    event.preventDefault();
    const email = window.prompt('Enter the email address registered to your MediMama account:');
    if (!email) return;
    const accounts = getAccounts();
    const account = accounts.find(item => item.email === email.trim().toLowerCase());
    if (!account) { showFeedback('loginFeedback', 'No account was found for that email.'); return; }
    const newPassword = window.prompt('Frontend demo: enter your new password. Use 8+ characters with uppercase, lowercase, number, and special character.');
    if (!newPassword) return;
    if (!isStrongPassword(newPassword)) { showFeedback('loginFeedback', 'The new password does not meet the password requirements.'); return; }
    account.password = newPassword;
    saveAccounts(accounts);
    showFeedback('loginFeedback', 'Password updated for this frontend demo. You may now log in.', 'success');
});

const legalModal = document.getElementById('legalModal');
document.querySelectorAll('[data-legal]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const isPrivacy = link.dataset.legal === 'privacy';
    document.getElementById('legalTitle').textContent = isPrivacy ? 'Privacy Policy Summary' : 'Terms of Use Summary';
    document.getElementById('legalMessage').textContent = isPrivacy
        ? 'MediMama uses the information you provide to manage maternal and infant health services. Only authorized users should access linked records. This frontend demo stores data only in this browser; the production policy will be supplied with the secure backend.'
        : 'Use MediMama only for your own account or an approved linked patient. It does not replace emergency services or professional medical advice. A complete version of these terms will be published with the production system.';
    legalModal.classList.add('show');
    legalModal.setAttribute('aria-hidden', 'false');
}));
document.getElementById('legalClose')?.addEventListener('click', () => {
    legalModal.classList.remove('show');
    legalModal.setAttribute('aria-hidden', 'true');
});

// ===============================
// INPUT ANIMATION
// ===============================

const inputs = document.querySelectorAll("input");

inputs.forEach(input => {

    input.addEventListener("focus", () => {

        input.parentElement.style.transform = "scale(1.01)";

    });

    input.addEventListener("blur", () => {

        input.parentElement.style.transform = "scale(1)";

    });

});


// ===============================
// BUTTON RIPPLE EFFECT
// ===============================

const buttons = document.querySelectorAll("button");

buttons.forEach(button => {

    button.addEventListener("click", function (e) {

        let x = e.clientX - button.offsetLeft;
        let y = e.clientY - button.offsetTop;

        const ripple = document.createElement("span");

        ripple.style.left = x + "px";
        ripple.style.top = y + "px";

        ripple.classList.add("ripple");

        this.appendChild(ripple);

        setTimeout(() => {

            ripple.remove();

        }, 600);

    });

});
