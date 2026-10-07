import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  nav: {
    home: "Home",
    library: "Workflows",
    studio: "Studio",
    runs: "Runs",
    evidence: "Evidence",
    watches: "Watches",
    agents: "Agents & engines",
    usage: "Usage & receipts",
    settings: "Settings",
    developer: "Developer",
    build: "Build",
    insight: "Insight",
    admin: "Workspace",
  },
  status: {
    CORROBORATED: "Corroborated",
    CONTRADICTED: "Contradicted",
    UNVERIFIED: "Unverified",
    INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  },
  decision: {
    SAFE_TO_PROCEED: "Safe to proceed",
    PROCEED_WITH_CAUTION: "Proceed with caution",
    WAIT_VERIFY_MORE: "Wait, verify more",
    DO_NOT_PROCEED: "Do not proceed",
  },
  common: {
    run: "Run",
    approveRun: "Approve & Run",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    copy: "Copy",
    copied: "Copied",
    searches: "searches",
    search: "Search",
    signOut: "Sign out",
    viewAll: "View all",
    demoMode: "Demo mode",
    liveMode: "Live",
    tryDemo: "Run demo",
    confidence: "Confidence",
    evidence: "Evidence",
  },
  home: {
    checkTitle: "Check anything",
    checkHint: "Paste a WhatsApp forward, a deal link, a stock tip or a job offer. We plan the agents, show the cost, and you approve.",
    checkPlaceholder: "e.g. Instant loan Rs 50,000 in 5 minutes, no CIBIL. Download QuickRupee app...",
    planIt: "Plan the check",
    recent: "Recent verdicts",
    alerts: "Watch alerts",
    usage: "Searches this month",
  },
  slides: {
    loan: { title: "Got a loan offer on WhatsApp? Check it in 30 seconds.", sub: "RBI lending-app directory, Play Store identity, newest reviews, news and ad transparency, in one approved run." },
    market: { title: "Read your market. Launch the ad. Every line backed by evidence.", sub: "Demand by state, rising searches, competitor prices and ads become a sourced brief and compliant ad copy." },
    buy: { title: "Is this deal real? Prices from every store.", sub: "Compare a too-good-to-be-true price against live Indian store listings before you pay." },
    watch: { title: "Know when competitors change price, ads, or reviews.", sub: "Schedule any workflow. We diff the evidence and alert you on Telegram or email." },
    ai: { title: "Describe it. We build the workflow.", sub: "Plain-language goals become an agent graph with a search estimate you approve first." },
  },
};

type Dict = typeof en;

const hi: Dict = {
  nav: {
    home: "होम",
    library: "वर्कफ़्लो",
    studio: "स्टूडियो",
    runs: "रन",
    evidence: "सबूत",
    watches: "निगरानी",
    agents: "एजेंट और इंजन",
    usage: "उपयोग और रसीदें",
    settings: "सेटिंग्स",
    developer: "डेवलपर",
    build: "बनाएँ",
    insight: "जानकारी",
    admin: "वर्कस्पेस",
  },
  status: {
    CORROBORATED: "पुष्ट",
    CONTRADICTED: "विरोधाभासी",
    UNVERIFIED: "असत्यापित",
    INSUFFICIENT_EVIDENCE: "अपर्याप्त सबूत",
  },
  decision: {
    SAFE_TO_PROCEED: "आगे बढ़ना सुरक्षित",
    PROCEED_WITH_CAUTION: "सावधानी से आगे बढ़ें",
    WAIT_VERIFY_MORE: "रुकें, और जाँचें",
    DO_NOT_PROCEED: "आगे न बढ़ें",
  },
  common: {
    run: "चलाएँ",
    approveRun: "मंज़ूर करें और चलाएँ",
    save: "सहेजें",
    cancel: "रद्द करें",
    delete: "हटाएँ",
    copy: "कॉपी",
    copied: "कॉपी हो गया",
    searches: "सर्च",
    search: "खोजें",
    signOut: "साइन आउट",
    viewAll: "सभी देखें",
    demoMode: "डेमो मोड",
    liveMode: "लाइव",
    tryDemo: "डेमो चलाएँ",
    confidence: "विश्वास",
    evidence: "सबूत",
  },
  home: {
    checkTitle: "कुछ भी जाँचें",
    checkHint: "व्हाट्सऐप फ़ॉरवर्ड, डील लिंक, स्टॉक टिप या नौकरी का ऑफ़र पेस्ट करें। हम एजेंट चुनते हैं, लागत दिखाते हैं, और आप मंज़ूरी देते हैं।",
    checkPlaceholder: "जैसे: 5 मिनट में 50,000 रुपये का लोन, बिना CIBIL। QuickRupee ऐप डाउनलोड करें...",
    planIt: "जाँच की योजना बनाएँ",
    recent: "हाल के निर्णय",
    alerts: "निगरानी अलर्ट",
    usage: "इस महीने के सर्च",
  },
  slides: {
    loan: { title: "व्हाट्सऐप पर लोन ऑफ़र मिला? 30 सेकंड में जाँचें।", sub: "RBI लेंडिंग-ऐप सूची, Play Store पहचान, नई समीक्षाएँ, समाचार और विज्ञापन पारदर्शिता, एक ही रन में।" },
    market: { title: "अपना बाज़ार समझें। विज्ञापन लॉन्च करें। हर पंक्ति सबूत के साथ।", sub: "राज्यवार माँग, बढ़ती खोजें, प्रतिस्पर्धियों की कीमतें और विज्ञापन, स्रोत सहित ब्रीफ़ और विज्ञापन बनते हैं।" },
    buy: { title: "क्या यह डील असली है? हर स्टोर की कीमत देखें।", sub: "भुगतान से पहले बहुत सस्ती कीमत को भारतीय स्टोरों की लाइव कीमतों से मिलाएँ।" },
    watch: { title: "जानें कब प्रतिस्पर्धी कीमत, विज्ञापन या समीक्षाएँ बदलते हैं।", sub: "कोई भी वर्कफ़्लो शेड्यूल करें। बदलाव पर टेलीग्राम या ईमेल अलर्ट।" },
    ai: { title: "बताइए, हम वर्कफ़्लो बनाते हैं।", sub: "सरल भाषा के लक्ष्य एजेंट ग्राफ़ बनते हैं, पहले सर्च अनुमान आपकी मंज़ूरी के लिए।" },
  },
};

const ta: Dict = {
  nav: {
    home: "முகப்பு",
    library: "பணிப்பாய்வுகள்",
    studio: "ஸ்டுடியோ",
    runs: "இயக்கங்கள்",
    evidence: "சான்றுகள்",
    watches: "கண்காணிப்பு",
    agents: "முகவர்கள் & இயந்திரங்கள்",
    usage: "பயன்பாடு & ரசீதுகள்",
    settings: "அமைப்புகள்",
    developer: "டெவலப்பர்",
    build: "உருவாக்கு",
    insight: "நுண்ணறிவு",
    admin: "பணியிடம்",
  },
  status: {
    CORROBORATED: "உறுதிப்படுத்தப்பட்டது",
    CONTRADICTED: "முரண்படுகிறது",
    UNVERIFIED: "சரிபார்க்கப்படவில்லை",
    INSUFFICIENT_EVIDENCE: "போதிய சான்று இல்லை",
  },
  decision: {
    SAFE_TO_PROCEED: "தொடரலாம்",
    PROCEED_WITH_CAUTION: "எச்சரிக்கையுடன் தொடரவும்",
    WAIT_VERIFY_MORE: "காத்திருந்து மேலும் சரிபார்க்கவும்",
    DO_NOT_PROCEED: "தொடர வேண்டாம்",
  },
  common: {
    run: "இயக்கு",
    approveRun: "அனுமதித்து இயக்கு",
    save: "சேமி",
    cancel: "ரத்து",
    delete: "நீக்கு",
    copy: "நகலெடு",
    copied: "நகலெடுக்கப்பட்டது",
    searches: "தேடல்கள்",
    search: "தேடு",
    signOut: "வெளியேறு",
    viewAll: "அனைத்தும்",
    demoMode: "டெமோ முறை",
    liveMode: "நேரலை",
    tryDemo: "டெமோ இயக்கு",
    confidence: "நம்பகத்தன்மை",
    evidence: "சான்றுகள்",
  },
  home: {
    checkTitle: "எதையும் சரிபாருங்கள்",
    checkHint: "வாட்ஸ்அப் செய்தி, டீல் இணைப்பு, பங்கு குறிப்பு அல்லது வேலை வாய்ப்பை ஒட்டுங்கள். முகவர்களைத் திட்டமிட்டு செலவைக் காட்டுவோம், நீங்கள் அனுமதியுங்கள்.",
    checkPlaceholder: "எ.கா. 5 நிமிடத்தில் ரூ 50,000 கடன், CIBIL தேவையில்லை. QuickRupee செயலியை பதிவிறக்கவும்...",
    planIt: "சரிபார்ப்பைத் திட்டமிடு",
    recent: "சமீபத்திய தீர்ப்புகள்",
    alerts: "கண்காணிப்பு எச்சரிக்கைகள்",
    usage: "இந்த மாத தேடல்கள்",
  },
  slides: {
    loan: { title: "வாட்ஸ்அப்பில் கடன் சலுகையா? 30 வினாடிகளில் சரிபாருங்கள்.", sub: "RBI கடன் செயலி பட்டியல், Play Store அடையாளம், புதிய மதிப்புரைகள், செய்திகள், விளம்பர வெளிப்படைத்தன்மை." },
    market: { title: "உங்கள் சந்தையைப் படியுங்கள். விளம்பரத்தைத் தொடங்குங்கள்.", sub: "மாநில வாரியான தேவை, உயரும் தேடல்கள், போட்டியாளர் விலைகள் மற்றும் விளம்பரங்கள் சான்றுடன்." },
    buy: { title: "இந்த டீல் உண்மையா? எல்லா கடைகளின் விலையும்.", sub: "பணம் செலுத்தும் முன் இந்திய கடைகளின் நேரடி விலைகளுடன் ஒப்பிடுங்கள்." },
    watch: { title: "போட்டியாளர்கள் விலை, விளம்பரம், மதிப்புரைகளை மாற்றும்போது அறியுங்கள்.", sub: "எந்த பணிப்பாய்வையும் அட்டவணைப்படுத்துங்கள். டெலிகிராம் அல்லது மின்னஞ்சல் எச்சரிக்கை." },
    ai: { title: "விவரியுங்கள். நாங்கள் பணிப்பாய்வை உருவாக்குவோம்.", sub: "எளிய மொழி இலக்குகள் முகவர் வரைபடமாக, தேடல் மதிப்பீட்டுடன்." },
  },
};

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
] as const;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, ta: { translation: ta } },
  lng: localStorage.getItem("rc_lang") || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(code: string) {
  localStorage.setItem("rc_lang", code);
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

export default i18n;
