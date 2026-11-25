(function () {
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }
  document.querySelectorAll('.pw-toggle').forEach(function (t) {
    t.addEventListener('click', function () {
      var input = t.parentNode.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.textContent = show ? 'Hide' : 'Show';
      t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  var signup = document.querySelector('[data-register-form]');
  if (signup) {
    var phone = signup.querySelector('[name="phone"]');
    var password = signup.querySelector('[name="password"]');
    var photo = signup.querySelector('[data-profile-photo]');
    var photoData = signup.querySelector('[data-photo-data]');
    var phoneError = signup.querySelector('[data-phone-error]');
    var passwordError = signup.querySelector('[data-password-error]');
    var photoError = signup.querySelector('[data-photo-error]');
    var nameError = signup.querySelector('[data-name-error]');
    var emailError = signup.querySelector('[data-email-error]');
    signup.addEventListener('submit', function (event) {
      event.preventDefault();
      phoneError.textContent = /^\d{10}$/.test(phone.value) ? '' : 'Enter exactly 10 digits.';
      passwordError.textContent = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/.test(password.value)
        ? '' : 'Use 8+ characters with uppercase, lowercase, a number and a symbol.';
      var file = photo.files && photo.files[0];
      photoError.textContent = !file ? 'Please choose a profile photo.'
        : !/^image\/(png|jpeg|webp)$/.test(file.type) ? 'Choose a PNG, JPG or WEBP image.'
        : file.size > 2 * 1024 * 1024 ? 'Photo must be smaller than 2 MB.' : '';
      var name = signup.querySelector('[name="name"]');
      var email = signup.querySelector('[name="email"]');
      nameError.textContent = name.value.trim() ? '' : 'Please enter your full name.';
      emailError.textContent = email.value.trim() && email.validity.typeMismatch ? 'Please enter a valid email address.'
        : !email.value.trim() ? 'Please enter your email address.' : '';
      if (phoneError.textContent || passwordError.textContent || photoError.textContent || nameError.textContent || emailError.textContent) {
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { photoData.value = reader.result; HTMLFormElement.prototype.submit.call(signup); };
      reader.onerror = function () { photoError.textContent = 'Could not read this photo. Please choose it again.'; };
      reader.readAsDataURL(file);
    });
    phone.addEventListener('input', function () { phoneError.textContent = ''; });
    password.addEventListener('input', function () { passwordError.textContent = ''; });
    photo.addEventListener('change', function () { photoError.textContent = ''; });
  }
})();
