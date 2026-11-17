import React, { useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  GraduationCap,
  Heart,
  LogIn,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Paperclip,
  Phone,
  Rss,
  SearchCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import heroCampusImg from '../assets/images/gausiya_madarsa_hero_crest_1794804871008.jpg';
import { Language } from '../i18n/translations.ts';
import { MadrasaSettings } from '../types.ts';
import { MadrasaLogo } from '../components/MadrasaLogo.tsx';
import { downloadFeedPostCard, downloadImageFile } from '../lib/download.ts';

export interface PublicHomeData {
  settings: MadrasaSettings | null;
  admissionsOpen?: boolean;
  resultsOpen?: boolean;
  classes: { id: string; name: string; code: string; room_no?: string }[];
  notices: any[];
  exams: any[];
  feedPosts: any[];
  committee: any[];
  publicResults: boolean;
}

interface HomePageProps {
  data: PublicHomeData | null;
  lang: Language;
  onOpenLogin: () => void;
  onOpenAdmission: () => void;
  onOpenAdmissionStatus?: () => void;
  onOpenCheckResult: () => void;
}

const CLASS_DESCRIPTIONS: { desc: string; descUr: string; icon: React.ComponentType<{ className?: string }>; accent: string }[] = [
  {
    desc: 'Foundation of Islamic knowledge, Noorani Qaida, Urdu literacy, and basic primary education.',
    descUr: 'بنیادی دینی تعلیم، نورانی قاعدہ، اردو خواندگی اور ابتدائی عصری مضامین۔',
    icon: BookOpen,
    accent: 'from-emerald-500 to-emerald-600',
  },
  {
    desc: 'Building upon foundational learning with Nazira Quran, Tajweed, and deeper comprehension.',
    descUr: 'ناظرہ قرآن مجید، تجوید اور بنیادی علوم کی پختہ مشق۔',
    icon: GraduationCap,
    accent: 'from-emerald-600 to-emerald-700',
  },
  {
    desc: 'Intermediate Islamic studies, basic Fiqh, Seerat-un-Nabi, and academic excellence.',
    descUr: 'متوسط دینی علوم، بنیادی فقہ، سیرتِ طیبہ اور تعلیمی معیار کی بلندی۔',
    icon: Sparkles,
    accent: 'from-emerald-700 to-emerald-800',
  },
  {
    desc: 'Advanced studies blending authentic Islamic tradition with structured modern education.',
    descUr: 'مستند دینی روایات کے ساتھ جدید نصاب اور علمی صلاحیتوں کی نشوونما۔',
    icon: Award,
    accent: 'from-teal-600 to-teal-700',
  },
  {
    desc: 'Senior primary & Hifz/Alimiyah readiness preparing students with confidence and Akhlaq.',
    descUr: 'اعلیٰ پرائمری اور حفظ و عالمیت کی تیاری، اخلاق اور اعتماد کے ساتھ۔',
    icon: BookOpen,
    accent: 'from-teal-700 to-teal-800',
  },
];

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Islamic Education',
    titleUr: 'دینی تعلیم',
    desc: 'Comprehensive Deeni Taleem rooted in authentic Quran, Tajweed, and Ahl-e-Sunnat traditions.',
    descUr: 'قرآن، تجوید اور مستند دینی روایات پر مبنی جامع دینی تعلیم۔',
  },
  {
    icon: GraduationCap,
    title: 'Modern Curriculum',
    titleUr: 'جدید نصاب',
    desc: 'Balanced education integrating Urdu, English, Mathematics, and worldly knowledge.',
    descUr: 'اردو، انگریزی، ریاضی اور عصری علوم کا متوازن نظام تعلیم۔',
  },
  {
    icon: Users,
    title: 'Qualified Teachers',
    titleUr: 'تجربہ کار اساتذہ',
    desc: 'Experienced and dedicated Asatiza focused on individual student progress.',
    descUr: 'ہر طالب علم کی انفرادی نگرانی کرنے والے مخلص اور باصلاحیت اساتذہ۔',
  },
  {
    icon: Heart,
    title: 'Character Building',
    titleUr: 'کردار سازی',
    desc: 'Strong emphasis on Islamic Akhlaq, respect for elders, discipline, and moral values.',
    descUr: 'اسلامی اخلاق، ادب، نظم و ضبط اور اعلیٰ اخلاقی اقدار کی تربیت۔',
  },
  {
    icon: Sparkles,
    title: 'Holistic Development',
    titleUr: 'ہمہ جہت ترقی',
    desc: 'Nurturing mind, character, and spiritual growth through competitions and programs.',
    descUr: 'علمی مقابلوں اور تربیتی پروگراموں کے ذریعے ذہنی و روحانی نشوونما۔',
  },
  {
    icon: Award,
    title: 'Exam Excellence',
    titleUr: 'امتحانی معیار',
    desc: 'Regular assessments, structured examinations, and transparent online result cards.',
    descUr: 'باقاعدہ امتحانات، شفاف نتائج اور آن لائن رپورٹ کارڈ کا نظام۔',
  },
];

export const HomePage: React.FC<HomePageProps> = ({
  data,
  lang,
  onOpenLogin,
  onOpenAdmission,
  onOpenAdmissionStatus,
  onOpenCheckResult,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewFeedPost, setViewFeedPost] = useState<any | null>(null);
  const [viewFeedImageIdx, setViewFeedImageIdx] = useState(0);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const settings = data?.settings;
  const admissionsOpen = data?.admissionsOpen !== false && settings?.admissions_open !== false;
  const resultsOpen = data?.resultsOpen !== false && settings?.results_open !== false;
  const classes: PublicHomeData['classes'] = data?.classes?.length
    ? data.classes
    : [
        { id: '1', name: 'Class 1', code: 'CLS-01' },
        { id: '2', name: 'Class 2', code: 'CLS-02' },
        { id: '3', name: 'Class 3', code: 'CLS-03' },
        { id: '4', name: 'Class 4', code: 'CLS-04' },
        { id: '5', name: 'Class 5', code: 'CLS-05' },
      ];

  const institutionName = lang === 'ur' ? (settings?.name_urdu || 'مدرسہ غوثیہ رضویہ') : (settings?.name || 'Madrasa Gausiya Razvia');
  const addressText = lang === 'ur' ? (settings?.address_urdu || 'اسلام نگر، رام گڑھ، پلاموں، جھارکھنڈ، انڈیا') : (settings?.address || 'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110');

  const formatDate = (d?: string) => {
    if (!d) return 'Recently';
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleDownloadImage = async (url: string, baseName: string, key: string) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadImageFile(url, baseName);
    } catch {
      // ignore transient network errors
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadAllImages = async (urls: string[], baseName: string, key: string) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      for (let i = 0; i < urls.length; i += 1) {
        await downloadImageFile(urls[i], `${baseName}-${i + 1}`);
      }
    } catch {
      // ignore transient errors
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadFeed = async (post: any, images: string[], imgIdx: number, key: string) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadFeedPostCard(
        {
          id: post.id,
          title: post.title,
          content: post.content,
          author_name: post.author_name,
          author_role: post.author_role,
          created_at: post.created_at,
          images,
          institutionName: settings?.name || 'Madrasa Gausiya Razvia',
        },
        imgIdx
      );
    } catch {
      // ignore transient errors
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717]">
      {/* Sticky Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3 shrink-0">
            <MadrasaLogo logoUrl={settings?.logo_url} size={42} />
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-[#DC1726] leading-tight whitespace-nowrap">
                {lang === 'ur' ? (settings?.name_urdu || 'مدرسہ غوثیہ رضویہ') : (settings?.name || 'Madarsa Gausiya Razvia')}
              </div>
              <div className="text-[11px] text-[#737373]">Islamnagar</div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#737373]">
            <a href="#about" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'تعارف' : 'About'}
            </a>
            <a href="#classes" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'درجات' : 'Classes'}
            </a>
            <a href="#features" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'خصوصیات' : 'Features'}
            </a>
            <a href="#notices" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'اعلانات' : 'Notices'}
            </a>
            <a href="#feed" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'فیڈ' : 'Feed'}
            </a>
            <a href="#committee" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'کمیٹی' : 'Committee'}
            </a>
            <a href="#contact" className="hover:text-[#DC1726] transition-colors whitespace-nowrap shrink-0">
              {lang === 'ur' ? 'رابطہ' : 'Contact'}
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {resultsOpen && (
              <button
                type="button"
                onClick={onOpenCheckResult}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
              >
                <Award className="w-3.5 h-3.5 text-[#DC1726]" />
                <span>{lang === 'ur' ? 'نتائج' : 'Check Result'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAdmission}
              className={`hidden md:inline-flex items-center px-3.5 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                admissionsOpen
                  ? 'border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
                  : 'border-red-200 bg-red-50 text-[#DC1726] hover:bg-red-100'
              }`}
            >
              {lang === 'ur' ? (admissionsOpen ? 'داخلہ فارم' : 'داخلہ بند') : (admissionsOpen ? 'Admission' : 'Admission Closed')}
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg gold-gradient text-white text-xs font-semibold shadow-md hover:opacity-95 transition-opacity whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'پورٹل لاگ ان' : 'Portal Login'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((p) => !p)}
              className="lg:hidden p-2 rounded-lg border border-neutral-200 bg-white text-[#171717]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-3 space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2 pb-2 border-b border-neutral-100">
              <a href="#about" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">About</a>
              <a href="#classes" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Classes</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Features</a>
              <a href="#notices" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Notices</a>
              <a href="#feed" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Feed</a>
              <a href="#committee" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Committee</a>
              <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="py-1.5 font-medium text-[#171717]">Contact</a>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onOpenAdmission(); }}
                className="flex-1 py-2 rounded-lg border border-neutral-200 font-semibold text-center"
              >
                {admissionsOpen ? 'Admission' : 'Admission Closed'}
              </button>
              {admissionsOpen && onOpenAdmissionStatus && (
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); onOpenAdmissionStatus(); }}
                  className="flex-1 py-2 rounded-lg border border-neutral-200 font-semibold text-center"
                >
                  Admission Status
                </button>
              )}
              {resultsOpen && (
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); onOpenCheckResult(); }}
                  className="flex-1 py-2 rounded-lg border border-neutral-200 font-semibold text-center"
                >
                  Check Result
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="top" className="relative overflow-hidden min-h-[620px] sm:min-h-[720px] lg:min-h-[820px] flex items-end">
        <img
          src={heroCampusImg}
          alt="Madarsa Gausiya Razvia Islamnagar Campus"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/45 to-black/85" />

        <div className="relative w-full max-w-5xl mx-auto px-4 pt-60 sm:pt-72 md:pt-80 lg:pt-96 pb-20 md:pb-24 text-center">
          <p
            className="text-sm sm:text-base font-medium tracking-widest text-amber-300/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] mb-3"
            dir="rtl"
          >
            بِسْمِ ٱللّٰهِ ٱلرَّحْمٰنِ ٱلرَّحِيمِ
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight text-balance drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]">
            {lang === 'ur' ? (
              <>
                مدرسہ غوثیہ <span className="text-[#FF6B6B]">رضویہ</span>
              </>
            ) : (
              <>
                Madarsa Gausiya
                <br />
                <span className="text-[#FF6B6B]">Razvia</span>
              </>
            )}
          </h1>

          <p className="mt-3 text-sm sm:text-base font-semibold text-white/90 tracking-[0.25em] uppercase drop-shadow">
            {lang === 'ur' ? 'اسلام نگر، رام گڑھ، جھارکھنڈ' : 'ISLAMNAGAR'}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3.5 text-white/90 text-xs sm:text-sm md:text-base font-medium drop-shadow">
            <span>Ilm</span>
            <span className="text-[#FF6B6B]" aria-hidden="true">•</span>
            <span>Akhlaq</span>
            <span className="text-[#FF6B6B]" aria-hidden="true">•</span>
            <span>Taleem</span>
            <span className="text-[#FF6B6B]" aria-hidden="true">•</span>
            <span>Mustaqbil</span>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#EF233C] hover:bg-[#DC1726] text-white text-sm font-semibold shadow-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>{lang === 'ur' ? 'پورٹل لاگ ان' : 'Portal Login'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenAdmission}
              className={`px-6 py-3 rounded-lg text-sm font-semibold shadow-md transition-colors whitespace-nowrap shrink-0 ${
                admissionsOpen
                  ? 'bg-white text-[#DC1726] hover:bg-neutral-100'
                  : 'bg-white/90 text-neutral-700 hover:bg-white'
              }`}
            >
              {lang === 'ur'
                ? (admissionsOpen ? 'آن لائن داخلہ' : 'داخلہ بند ہے')
                : (admissionsOpen ? 'Apply for Admission' : 'Admissions Closed')}
            </button>

            {admissionsOpen && onOpenAdmissionStatus && (
              <button
                type="button"
                onClick={onOpenAdmissionStatus}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors whitespace-nowrap shrink-0"
              >
                <SearchCheck className="w-4 h-4" />
                <span>{lang === 'ur' ? 'داخلہ اسٹیٹس' : 'Admission Status'}</span>
              </button>
            )}

            {resultsOpen && (
              <button
                type="button"
                onClick={onOpenCheckResult}
                className="px-6 py-3 rounded-lg bg-white/95 text-[#171717] hover:bg-white text-sm font-semibold shadow-md transition-colors whitespace-nowrap shrink-0"
              >
                {lang === 'ur' ? 'نتیجہ دیکھیں' : 'Check Result'}
              </button>
            )}

            <a
              href="#about"
              className="px-6 py-3 rounded-lg border border-white/30 bg-black/45 text-white hover:bg-black/60 backdrop-blur-sm text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'ur' ? 'مدرسہ کا تعارف' : 'Explore Madarsa'}
            </a>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/75 to-transparent" />
      </section>

      {/* About Section */}
      <section id="about" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">
              {lang === 'ur' ? 'ہمارے بارے میں' : 'About Us'}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#171717]">
              {lang === 'ur' ? 'علم اور ایمان کی آبیاری' : 'Nurturing Knowledge & Faith'}
            </h2>
            <p className="mt-5 text-[#737373] leading-relaxed text-base sm:text-lg">
              Madrasa Gausiya Razvia, located in Islamnagar, Ramgarh, Palamu, Jharkhand, is dedicated to providing quality Islamic and modern education. Founded by{' '}
              <span className="font-semibold text-[#171717]">Dilshad Ansari S/o MD Ayub Ansari</span>, we nurture students from Class 1 to 5 with a balanced curriculum that builds both Deeni knowledge and worldly understanding, shaping young minds for a bright future.
            </p>
            <div className="mt-5 inline-flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 px-5 py-3 rounded-xl bg-white border border-neutral-200 shadow-xs text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#DC1726]">Founder</span>
              <span className="hidden sm:inline text-neutral-300">·</span>
              <span className="font-bold text-[#171717]">Dilshad Ansari</span>
              <span className="text-xs text-[#737373]">S/o MD Ayub Ansari</span>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {[
              { label: 'Classes', value: '1 – 5', icon: BookOpen },
              { label: 'Education', value: 'Islamic + Modern', icon: GraduationCap },
              { label: 'Location', value: 'Palamu, JH', icon: MapPin },
              { label: 'Focus', value: 'Holistic Growth', icon: Heart },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="text-center p-5 rounded-xl bg-white border border-neutral-200 shadow-xs">
                  <Icon className="w-6 h-6 text-[#DC1726] mx-auto mb-2" />
                  <div className="font-bold text-[#171717] text-sm font-mono-num">{item.value}</div>
                  <div className="text-xs text-[#737373] mt-1">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Academic Programs / Classes */}
      <section id="classes" className="py-16 md:py-24 bg-neutral-100/70 border-y border-neutral-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">
              {lang === 'ur' ? 'ہمارے درجات' : 'Our Classes'}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#171717]">
              {lang === 'ur' ? 'تعلیمی درجات و پروگرامز' : 'Academic Programs'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {classes.slice(0, 5).map((cls, idx) => {
              const meta = CLASS_DESCRIPTIONS[idx % CLASS_DESCRIPTIONS.length];
              const Icon = meta.icon;
              return (
                <div
                  key={cls.id}
                  className="group bg-white rounded-xl border border-neutral-200 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className={`h-1.5 bg-gradient-to-r ${meta.accent}`} />
                    <div className="p-5">
                      <div className="w-11 h-11 rounded-xl green-gradient flex items-center justify-center mb-4">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="font-bold text-[#171717] text-lg">{cls.name}</h3>
                      <p className="mt-2 text-xs text-[#737373] leading-relaxed">
                        {lang === 'ur' ? meta.descUr : meta.desc}
                      </p>
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t border-neutral-100 text-[11px] font-mono-num text-[#737373]">
                    {cls.code}{cls.room_no ? ` · ${cls.room_no}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Education Features */}
      <section id="features" className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">
              {lang === 'ur' ? 'ہمارا امتیاز' : 'Why Choose Us'}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#171717]">
              {lang === 'ur' ? 'تعلیمی خصوصیات' : 'Education Features'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="flex gap-4 p-5 rounded-xl bg-white border border-neutral-200 shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="w-11 h-11 rounded-lg bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#171717] text-sm">
                      {lang === 'ur' ? f.titleUr : f.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#737373] leading-relaxed">
                      {lang === 'ur' ? f.descUr : f.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Latest Notices & Upcoming Exams */}
      <section id="notices" className="py-16 md:py-24 bg-neutral-100/70 border-y border-neutral-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Latest Notices */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Bell className="w-5 h-5 text-[#DC1726]" />
                <h2 className="text-2xl font-bold text-[#171717]">
                  {lang === 'ur' ? 'تازہ ترین اعلانات' : 'Latest Notices'}
                </h2>
              </div>
              <div className="space-y-3">
                {data?.notices && data.notices.length > 0 ? (
                  data.notices.map((n) => (
                    <div key={n.id} className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-[#171717] text-sm">{n.title}</h3>
                        <span className="text-[11px] font-medium text-[#DC1726] shrink-0">{n.category}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#737373] line-clamp-2">{n.description}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[#737373] font-mono-num">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(n.publish_date)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 bg-white rounded-xl border border-neutral-200 text-center text-xs text-[#737373]">
                    No public notices published yet.
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Exams */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Calendar className="w-5 h-5 text-[#DC1726]" />
                <h2 className="text-2xl font-bold text-[#171717]">
                  {lang === 'ur' ? 'آنے والے امتحانات' : 'Upcoming Exams'}
                </h2>
              </div>
              <div className="space-y-3">
                {data?.exams && data.exams.length > 0 ? (
                  data.exams.map((ex) => {
                    const dt = ex.start_date ? new Date(ex.start_date) : null;
                    const month = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString('en-US', { month: 'short' }) : 'EXM';
                    const day = dt && !Number.isNaN(dt.getTime()) ? String(dt.getDate()).padStart(2, '0') : '--';
                    return (
                      <div key={ex.id} className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg green-gradient flex flex-col items-center justify-center text-white shrink-0 font-mono-num">
                          <span className="text-[10px] uppercase">{month}</span>
                          <span className="text-lg font-bold leading-none">{day}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-[#171717] text-sm truncate">{ex.name}</h3>
                          <p className="text-xs text-[#737373] mt-0.5">
                            {ex.class_name} · {ex.exam_type} · {ex.status}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 bg-white rounded-xl border border-neutral-200 text-center text-xs text-[#737373]">
                    No upcoming exams scheduled.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feed Updates */}
      <section id="feed" className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">Updates</div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#171717] flex items-center justify-center gap-2">
              <Rss className="w-6 h-6 text-[#DC1726]" />
              <span>{lang === 'ur' ? 'سرگرمیاں اور فیڈ' : 'Madrasa Feed'}</span>
            </h2>
          </div>

          <div className="space-y-4">
            {data?.feedPosts && data.feedPosts.length > 0 ? (
              data.feedPosts.map((post) => {
                let imgs: string[] = [];
                try {
                  imgs = JSON.parse(post.images_json || '[]');
                } catch {
                  imgs = [];
                }
                return (
                  <div key={post.id} className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
                    {imgs[0] && (
                      <img
                        src={imgs[0]}
                        alt={post.title || 'Madrasa update'}
                        onClick={() => {
                          setViewFeedPost({ ...post, parsedImages: imgs });
                          setViewFeedImageIdx(0);
                        }}
                        className="w-full h-52 object-cover border-b border-neutral-100 cursor-pointer hover:opacity-95 transition-opacity"
                      />
                    )}
                    <div className="p-5">
                      {post.title && (
                        <h3
                          onClick={() => {
                            setViewFeedPost({ ...post, parsedImages: imgs });
                            setViewFeedImageIdx(0);
                          }}
                          className="font-bold text-[#171717] text-base cursor-pointer hover:text-[#DC1726] transition-colors"
                        >
                          {post.title}
                        </h3>
                      )}
                      <p className="mt-1.5 text-sm text-[#737373] whitespace-pre-line leading-relaxed">{post.content}</p>
                      <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap items-center gap-2 text-xs text-[#737373]">
                        <div className="w-6 h-6 rounded-full green-gradient text-white flex items-center justify-center text-[10px] font-bold">
                          {String(post.author_name || 'A').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-[#171717]">{post.author_name}</span>
                        <span>·</span>
                        <span>{post.author_role}</span>
                        <span>·</span>
                        <span className="font-mono-num">{formatDate(post.created_at)}</span>
                        {imgs.length > 1 && (
                          <span className="inline-flex items-center gap-1 text-[#0EA5E9]">
                            <Paperclip className="w-3 h-3" /> {imgs.length} media
                          </span>
                        )}
                        <div className="ms-auto flex flex-wrap items-center gap-2">
                          {imgs.length > 0 && (
                            <button
                              type="button"
                              disabled={downloadingKey === `img-${post.id}`}
                              onClick={() =>
                                handleDownloadImage(
                                  imgs[0],
                                  post.title || `madrasa-photo-${post.id}`,
                                  `img-${post.id}`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-60"
                            >
                              <Download className="w-3.5 h-3.5 text-[#0EA5E9]" />
                              <span>{downloadingKey === `img-${post.id}` ? 'Saving...' : 'Download Image'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={downloadingKey === `feed-${post.id}`}
                            onClick={() => handleDownloadFeed(post, imgs, 0, `feed-${post.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            <Download className="w-3.5 h-3.5 text-[#10B981]" />
                            <span>{downloadingKey === `feed-${post.id}` ? 'Saving...' : 'Download Feed'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setViewFeedPost({ ...post, parsedImages: imgs });
                              setViewFeedImageIdx(0);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-semibold text-[#171717] hover:bg-neutral-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#DC1726]" />
                            <span>View</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 bg-white rounded-xl border border-neutral-200 text-center text-xs text-[#737373]">
                No feed posts yet. Login to share updates.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Madrasa Committee */}
      <section id="committee" className="py-16 md:py-24 bg-neutral-100/70 border-y border-neutral-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">Leadership</div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#171717]">
              {lang === 'ur' ? 'مدرسہ کمیٹی' : 'Madrasa Committee'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(data?.committee || []).map((m) => (
              <div key={m.id} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs flex flex-col items-center text-center">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.full_name} className="w-20 h-20 rounded-full object-cover border-2 border-neutral-100 mb-3" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[#3B0A0D] text-white flex items-center justify-center text-2xl font-bold mb-3">
                    {String(m.full_name || 'M').charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="text-base font-bold text-[#171717]">{m.full_name}</h3>
                <div className="text-xs font-semibold text-[#DC1726] mt-0.5">{m.designation}</div>
                {m.mobile && (
                  <a
                    href={`tel:${m.mobile}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono-num text-[#DC1726] hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{m.mobile}</span>
                  </a>
                )}
                {m.description && (
                  <p className="mt-3 text-xs text-[#737373] leading-relaxed">{m.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Us */}
      <section id="contact" className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="text-xs font-semibold tracking-widest text-[#DC1726] uppercase mb-2">Get In Touch</div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#171717]">
            Contact Us
          </h2>
          <p className="mt-2 text-xs text-[#737373]">
            Reach Madrasa Gausiya Razvia directly via phone, WhatsApp, or Gmail.
          </p>

          <div className="mt-5 inline-flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 px-5 py-3 rounded-xl bg-white border border-neutral-200 shadow-xs text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#DC1726]">Founder</span>
            <span className="hidden sm:inline text-neutral-300">·</span>
            <span className="font-bold text-[#171717]">Dilshad Ansari</span>
            <span className="text-xs text-[#737373]">S/o MD Ayub Ansari</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-start">
            <a
              href="https://wa.me/917209629509"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3.5 p-4 rounded-xl bg-white border border-neutral-200 shadow-xs hover:border-[#10B981] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#10B981]">WhatsApp / Call</div>
                <div className="text-sm font-bold text-[#171717] font-mono-num">7209629509</div>
                <div className="text-xs text-[#737373]">Tap to chat on WhatsApp</div>
              </div>
            </a>

            <a
              href="tel:+916202736648"
              className="flex items-center gap-3.5 p-4 rounded-xl bg-white border border-neutral-200 shadow-xs hover:border-[#0EA5E9] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0EA5E9] flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0EA5E9]">Contact Number</div>
                <div className="text-sm font-bold text-[#171717] font-mono-num">6202736648</div>
                <div className="text-xs text-[#737373]">Tap to call directly</div>
              </div>
            </a>

            <a
              href="mailto:dil.dil.a.1345@gmail.com"
              className="flex items-center gap-3.5 p-4 rounded-xl bg-white border border-neutral-200 shadow-xs hover:border-[#DC1726] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#DC1726]">Gmail</div>
                <div className="text-sm font-bold text-[#171717] break-all">dil.dil.a.1345@gmail.com</div>
                <div className="text-xs text-[#737373]">Send an official email</div>
              </div>
            </a>
          </div>

          <div className="mt-6 space-y-2.5 text-sm text-[#737373]">
            <div className="flex items-center justify-center gap-2.5">
              <MapPin className="w-4 h-4 text-[#DC1726] shrink-0" />
              <span>{addressText}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 font-mono-num">
              <Phone className="w-4 h-4 text-[#DC1726] shrink-0" />
              <a href="tel:+917209629509" className="hover:text-[#DC1726]">
                +91 72096 29509
              </a>
              <span>·</span>
              <a href="tel:+916202736648" className="hover:text-[#DC1726]">
                +91 62027 36648
              </a>
              {settings?.phone && settings.phone !== '+91 72096 29509' && settings.phone !== '+91 62027 36648' && (
                <>
                  <span>·</span>
                  <a href={`tel:${settings.phone}`} className="hover:text-[#DC1726]">
                    {settings.phone}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="green-gradient py-10 text-white/85">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-2">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <MadrasaLogo logoUrl={settings?.logo_url} size={32} surface="dark" />
            <span className="font-bold text-white text-base">{institutionName}</span>
          </div>
          <p className="text-xs text-white/90 font-medium">Founder: Dilshad Ansari S/o MD Ayub Ansari</p>
          <p className="text-xs text-white/80">{addressText}</p>
          <p className="text-xs font-mono-num text-white/75">
            Contact: 7209629509 · 6202736648 · Gmail: dil.dil.a.1345@gmail.com
          </p>
          <div className="pt-3 flex flex-wrap items-center justify-center gap-4 text-xs">
            <button type="button" onClick={onOpenLogin} className="hover:text-white underline">
              Portal Login
            </button>
            <button type="button" onClick={onOpenAdmission} className="hover:text-white underline">
              Online Admission
            </button>
            {resultsOpen && (
              <button type="button" onClick={onOpenCheckResult} className="hover:text-white underline">
                Check Result
              </button>
            )}
            <a href="https://wa.me/917209629509" target="_blank" rel="noopener noreferrer" className="hover:text-white underline">
              WhatsApp Us
            </a>
            <a href="mailto:dil.dil.a.1345@gmail.com" className="hover:text-white underline">
              Email Us
            </a>
          </div>
          <p className="pt-3 text-[11px] text-white/55">Ilm · Akhlaq · Taleem · Mustaqbil</p>
        </div>
      </footer>
      {/* Public Feed View Modal */}
      {viewFeedPost && (() => {
        const imgs: string[] = Array.isArray(viewFeedPost.parsedImages) ? viewFeedPost.parsedImages : [];
        const safeIdx = Math.min(viewFeedImageIdx, Math.max(0, imgs.length - 1));
        return (
          <div className="fixed inset-0 z-50 bg-black/65 overflow-y-auto p-3 sm:p-6 flex items-start sm:items-center justify-center">
            <div className="mx-auto max-w-2xl w-full bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden my-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full green-gradient text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {String(viewFeedPost.author_name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#171717]">{viewFeedPost.author_name}</div>
                    <div className="text-[11px] text-[#737373] font-mono-num">
                      {viewFeedPost.author_role} · {formatDate(viewFeedPost.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewFeedPost(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-200"
                  aria-label="Close feed post"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {viewFeedPost.title && (
                  <h3 className="text-lg font-bold text-[#171717]">{viewFeedPost.title}</h3>
                )}
                <p className="text-sm text-[#525252] leading-relaxed whitespace-pre-line">
                  {viewFeedPost.content}
                </p>

                {imgs.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="relative rounded-xl border border-neutral-200 bg-neutral-950/95 overflow-hidden flex items-center justify-center">
                      <img
                        src={imgs[safeIdx]}
                        alt={viewFeedPost.title || `Feed photo ${safeIdx + 1}`}
                        className="w-full max-h-[60vh] object-contain"
                      />
                      {imgs.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setViewFeedImageIdx((prev) => (prev - 1 + imgs.length) % imgs.length)
                            }
                            className="absolute start-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                            aria-label="Previous image"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewFeedImageIdx((prev) => (prev + 1) % imgs.length)}
                            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                            aria-label="Next image"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-2 end-2 px-2 py-0.5 rounded bg-black/65 text-white text-[10px] font-mono-num">
                            {safeIdx + 1} / {imgs.length}
                          </div>
                        </>
                      )}
                    </div>
                    {imgs.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {imgs.map((u, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setViewFeedImageIdx(idx)}
                            className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                              idx === safeIdx ? 'border-[#DC1726]' : 'border-neutral-200 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={u} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={downloadingKey === `modal-img-${viewFeedPost.id}`}
                        onClick={() =>
                          handleDownloadImage(
                            imgs[safeIdx],
                            `${viewFeedPost.title || 'madrasa-photo'}-${safeIdx + 1}`,
                            `modal-img-${viewFeedPost.id}`
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0EA5E9] text-white text-xs font-semibold hover:bg-sky-600 transition-colors disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {downloadingKey === `modal-img-${viewFeedPost.id}`
                            ? 'Downloading Image...'
                            : imgs.length > 1
                              ? `Download Photo ${safeIdx + 1}`
                              : 'Download Image'}
                        </span>
                      </button>
                      {imgs.length > 1 && (
                        <button
                          type="button"
                          disabled={downloadingKey === `modal-all-${viewFeedPost.id}`}
                          onClick={() =>
                            handleDownloadAllImages(
                              imgs,
                              viewFeedPost.title || 'madrasa-photo',
                              `modal-all-${viewFeedPost.id}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 transition-colors disabled:opacity-60"
                        >
                          <Download className="w-3.5 h-3.5 text-[#0EA5E9]" />
                          <span>
                            {downloadingKey === `modal-all-${viewFeedPost.id}`
                              ? 'Downloading All...'
                              : `Download All (${imgs.length})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs text-[#737373]">
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-[#DC1726]" />
                    <span className="font-mono-num">{viewFeedPost.likes_count || 0}</span> Likes
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={downloadingKey === `modal-feed-${viewFeedPost.id}`}
                      onClick={() =>
                        handleDownloadFeed(viewFeedPost, imgs, safeIdx, `modal-feed-${viewFeedPost.id}`)
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {downloadingKey === `modal-feed-${viewFeedPost.id}`
                          ? 'Preparing Feed...'
                          : 'Download Feed'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFeedPost(null)}
                      className="px-4 py-1.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
