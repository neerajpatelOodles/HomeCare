'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const FILES = [
  { key: 'resume', label: 'Résumé', required: true },
  { key: 'cprFirstAid', label: 'CPR / First Aid certificate' },
  { key: 'policeCheck', label: 'Police check' },
  { key: 'governmentId', label: 'Government ID' },
];

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  profession: '',
  licenseNumber: '',
  yearsExperience: '',
  city: '',
  region: '',
  coverNote: '',
  website: '',
};

function checkFileClient(file) {
  if (!file) return '';
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  const maxMb = 10;
  if (!allowed.includes(file.type)) return 'Only PDF, JPG, or PNG files are allowed.';
  if (file.size > maxMb * 1024 * 1024) return `File must be smaller than ${maxMb} MB.`;
  return '';
}

export default function HomePage() {
  const [options, setOptions] = useState({ professions: ['RN', 'RPN', 'PSW', 'RSW'], maxFileMb: 10 });
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState({});
  const [certs, setCerts] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api('/api/recruitment/options')
      .then((res) => setOptions(res.data || options))
      .catch(() => setOptions((prev) => prev));
  }, []);

  const setField = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  function pickFile(key, file) {
    const msg = checkFileClient(file);
    setErrors((prev) => ({ ...prev, [key]: msg }));
    setFiles((prev) => ({ ...prev, [key]: msg ? null : file }));
  }

  function pickCerts(list) {
    const arr = Array.from(list || []);
    const msg = arr.length > 3 ? 'You can attach up to 3 certifications.' : arr.map(checkFileClient).find(Boolean) || '';
    setErrors((prev) => ({ ...prev, certifications: msg }));
    setCerts(msg ? [] : arr);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const local = {};

    if (!form.firstName.trim()) local.firstName = 'Required';
    if (!form.lastName.trim()) local.lastName = 'Required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) local.email = 'Enter a valid email';
    if (form.phone.trim().length < 7) local.phone = 'Enter a valid phone number';
    if (!form.profession) local.profession = 'Choose your profession';
    if (!files.resume) local.resume = 'Your résumé is required';

    if (Object.keys(local).length) {
      setErrors((prev) => ({ ...prev, ...local }));
      setError('Please fix the highlighted fields and try again.');
      return;
    }

    const fd = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== '') fd.append(key, typeof value === 'string' ? value.trim() : value);
    });
    FILES.forEach((file) => {
      if (files[file.key]) fd.append(file.key, files[file.key]);
    });
    certs.forEach((file) => fd.append('certifications', file));

    try {
      setSaving(true);
      const res = await api('/api/recruitment/applications', { method: 'POST', body: fd });
      setDone(res.data?.reference || 'Application submitted');
      setForm(initialForm);
      setFiles({});
      setCerts([]);
      setErrors({});
    } catch (err) {
      if (err.errors?.length) {
        const nextErrors = {};
        err.errors.forEach((item) => {
          nextErrors[item.field] = item.message;
        });
        setErrors(nextErrors);
      }
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          <span>Home-Care Central</span>
        </div>

        <nav className="public-nav">
          <Link href="#careers">Careers</Link>
          <Link href="#about">Why join us</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <main className="public-content">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Join our care team</span>
            <h1>Make a real difference in people’s lives.</h1>
            <p>
              We’re hiring compassionate professionals to support clients with dignity,
              reliability, and person-centered care across the community.
            </p>
            <div className="hero-actions">
              <a href="#apply" className="primary-btn">Apply now</a>
              <Link href="/login" className="secondary-btn">Staff sign in</Link>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <strong>24/7</strong>
                <span>Community support</span>
              </div>
              <div className="stat-box">
                <strong>500+</strong>
                <span>Care visits monthly</span>
              </div>
              <div className="stat-box">
                <strong>4 roles</strong>
                <span>RN, RPN, PSW, RSW</span>
              </div>
            </div>
          </div>

          <div className="hero-card" id="about">
            <h2>Why caregivers choose us</h2>
            <ul>
              <li>Flexible work scheduling and predictable support</li>
              <li>Professional team culture and clear communication</li>
              <li>Meaningful client relationships and continuity of care</li>
              <li>Strong onboarding and HR support</li>
            </ul>
          </div>
        </section>

        <section className="page-section" id="careers">
          <div className="section-heading">
            <p className="mini-title">Open roles</p>
            <h2>Caregiver application</h2>
          </div>

          {done ? (
            <div className="success-box">
              <h3>Application received</h3>
              <p>Thank you for applying. Our HR team will review your application and contact you soon.</p>
              <p>
                Reference: <strong>{done}</strong>
              </p>
              <Link href="/login" className="primary-btn inline-btn">Back to sign in</Link>
            </div>
          ) : (
            <form className="application-form" onSubmit={submit} noValidate>
              <div className="form-row two-col">
                <div className="field-wrap">
                  <label htmlFor="firstName">First name</label>
                  <input id="firstName" value={form.firstName} onChange={setField('firstName')} />
                  {errors.firstName && <small className="field-error">{errors.firstName}</small>}
                </div>

                <div className="field-wrap">
                  <label htmlFor="lastName">Last name</label>
                  <input id="lastName" value={form.lastName} onChange={setField('lastName')} />
                  {errors.lastName && <small className="field-error">{errors.lastName}</small>}
                </div>
              </div>

              <div className="form-row two-col">
                <div className="field-wrap">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={form.email} onChange={setField('email')} />
                  {errors.email && <small className="field-error">{errors.email}</small>}
                </div>

                <div className="field-wrap">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" value={form.phone} onChange={setField('phone')} />
                  {errors.phone && <small className="field-error">{errors.phone}</small>}
                </div>
              </div>

              <div className="form-row two-col">
                <div className="field-wrap">
                  <label htmlFor="profession">Profession</label>
                  <select id="profession" value={form.profession} onChange={setField('profession')}>
                    <option value="">Select your role</option>
                    {options.professions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {errors.profession && <small className="field-error">{errors.profession}</small>}
                </div>

                <div className="field-wrap">
                  <label htmlFor="licenseNumber">License / registration number</label>
                  <input id="licenseNumber" value={form.licenseNumber} onChange={setField('licenseNumber')} />
                </div>
              </div>

              <div className="form-row two-col">
                <div className="field-wrap">
                  <label htmlFor="yearsExperience">Years of experience</label>
                  <input id="yearsExperience" type="number" min="0" max="60" value={form.yearsExperience} onChange={setField('yearsExperience')} />
                </div>

                <div className="field-wrap">
                  <label htmlFor="city">City</label>
                  <input id="city" value={form.city} onChange={setField('city')} />
                </div>
              </div>

              <div className="field-wrap">
                <label htmlFor="region">Region</label>
                <input id="region" value={form.region} onChange={setField('region')} />
              </div>

              <div className="field-wrap">
                <label htmlFor="coverNote">Tell us a little about yourself</label>
                <textarea id="coverNote" value={form.coverNote} onChange={setField('coverNote')} rows={5} />
              </div>

              <div className="upload-block" id="apply">
                <div className="upload-header">
                  <h3>Upload documents</h3>
                  <span>PDF, JPG, PNG • up to {options.maxFileMb || 10} MB each</span>
                </div>

                <div className="upload-grid">
                  {FILES.map((item) => (
                    <div className="field-wrap" key={item.key}>
                      <label htmlFor={item.key}>{item.label}{item.required ? ' *' : ''}</label>
                      <input
                        id={item.key}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => pickFile(item.key, e.target.files?.[0])}
                      />
                      {errors[item.key] && <small className="field-error">{errors[item.key]}</small>}
                    </div>
                  ))}

                  <div className="field-wrap">
                    <label htmlFor="certifications">Certifications (up to 3)</label>
                    <input
                      id="certifications"
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => pickCerts(e.target.files)}
                    />
                    {errors.certifications && <small className="field-error">{errors.certifications}</small>}
                  </div>
                </div>
              </div>

              <div className="field-wrap honeypot" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" value={form.website} onChange={setField('website')} />
              </div>

              {error && <div className="form-alert">{error}</div>}

              <div className="submit-row">
                <button className="primary-btn" type="submit" disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit application'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
