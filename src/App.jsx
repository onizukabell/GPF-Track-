import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, onAuthStateChanged, 
  GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs 
} from 'firebase/firestore';
import { 
  Wallet, TrendingUp, TrendingDown, Calendar, Users, Settings, 
  Plus, Trash2, Download, Upload, CheckCircle, XCircle, Clock, LogOut, Edit
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDuY15mySBhefsFe0CFBYujOqz3ESKoqN0",
  authDomain: "gpf-tracker-app.firebaseapp.com",
  projectId: "gpf-tracker-app",
  storageBucket: "gpf-tracker-app.firebasestorage.app",
  messagingSenderId: "278934592778",
  appId: "1:278934592778:web:da6442488e24574f33eef3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-gpf-tracker'; // ชื่อ ID ของแอปคุณ (ห้ามเปลี่ยนถ้าใช้ชื่อนี้ใน Database ไปแล้ว)

// --- Helper for Calculations ---
const calculateProcessedRecords = (rawRecords) => {
  let runningPrincipal = 0;
  let prevBalance = 0;

  return [...rawRecords]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((rec, index) => {
      const totalBal = Number(rec.totalBalance) || 0;
      const addedCont = Number(rec.addedContribution) || 0;
      const basePrin = Number(rec.basePrincipal) || 0;

      if (index === 0) {
        runningPrincipal = basePrin > 0 ? basePrin : totalBal;
        const totalProfit = totalBal - runningPrincipal;
        prevBalance = totalBal;
        return { ...rec, principal: runningPrincipal, dailyProfit: 0, dailyProfitPercent: 0, totalProfit };
      }

      runningPrincipal += addedCont;
      const totalProfit = totalBal - runningPrincipal;
      const dailyProfit = (totalBal - prevBalance) - addedCont;
      const dailyProfitPercent = prevBalance > 0 ? (dailyProfit / prevBalance) * 100 : 0;

      prevBalance = totalBal;
      return { ...rec, principal: runningPrincipal, dailyProfit, dailyProfitPercent, totalProfit };
    })
    .reverse();
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
        // นำการล็อกอิน Anonymous อัตโนมัติออก เพื่อให้ไปแสดงหน้า LoginScreen แทน
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProfiles(data);
      setLoading(false);
    }, (err) => console.error(err));
    return () => unsub();
  }, [user]);

  const currentProfile = useMemo(() => profiles.find(p => p.uid === user?.uid), [profiles, user]);

  useEffect(() => {
    if (!user || !currentProfile || (currentProfile.status !== 'approved' && currentProfile.role !== 'admin')) return;
    
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'gpf_records');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data);
    }, (err) => console.error(err));
    return () => unsub();
  }, [user, currentProfile]);

  // --- Calculations ---
  const processedRecords = useMemo(() => calculateProcessedRecords(records), [records]);

  // ซิงค์ยอดสรุปล่าสุดไปยัง Profile สาธารณะ เพื่อให้หน้า Admin สามารถดึงไปแสดงผลได้
  useEffect(() => {
    if (!user || !currentProfile || processedRecords.length === 0) return;
    
    const latest = processedRecords[0];
    // อัปเดตเมื่อค่ามีการเปลี่ยนแปลงเท่านั้นเพื่อประหยัดการเขียนฐานข้อมูล
    if (currentProfile.latestBalance !== latest.totalBalance || currentProfile.totalProfit !== latest.totalProfit) {
      updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', user.uid), {
        latestBalance: latest.totalBalance,
        totalProfit: latest.totalProfit,
        lastUpdated: new Date().toISOString()
      }).catch(err => console.error("Failed to sync stats:", err));
    }
  }, [processedRecords, user, currentProfile]);

  // --- Views Controller ---
  if (loading) return <div className="flex h-screen items-center justify-center bg-teal-50"><div className="text-xl text-teal-600 animate-pulse">กำลังโหลดข้อมูล...</div></div>;
  if (!user) return <LoginScreen />;
  if (!currentProfile) return <RegisterScreen user={user} isFirst={profiles.length === 0} />;
  if (currentProfile.status === 'pending') return <PendingScreen />;
  
  return <MainDashboard user={user} profile={currentProfile} records={processedRecords} profiles={profiles} />;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function LoginScreen() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Login Error:", error);
      alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบ หรือคุณอาจปิดหน้าต่างไปก่อน");
    }
    setIsLoggingIn(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-teal-50/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-teal-100/50 border border-teal-50 text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-400 p-4 text-white shadow-lg shadow-teal-200">
            <Wallet size={40} />
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800">เข้าสู่ระบบ</h1>
        <h2 className="mb-8 text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500">GPF Tracker</h2>
        
        <button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-white border border-gray-300 px-4 py-3.5 font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" className="w-5 h-5" />
          {isLoggingIn ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วยบัญชี Google'}
        </button>
        
        <p className="mt-6 text-sm text-gray-500">
          เพื่อให้คุณสามารถใช้งานข้อมูลร่วมกันได้หลายอุปกรณ์
        </p>
      </div>
    </div>
  );
}

function RegisterScreen({ user, isFirst }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', user.uid);
      await setDoc(profileRef, {
        uid: user.uid,
        name: name.trim(),
        role: isFirst ? 'admin' : 'user',
        status: isFirst ? 'approved' : 'pending',
        createdAt: new Date().toISOString(),
        email: user.email || ''
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-teal-50/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-teal-100/50 border border-teal-50">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-400 p-4 text-white shadow-lg shadow-teal-200">
            <Wallet size={40} />
          </div>
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-800">ยืนยันตัวตนสำเร็จ</h1>
        <h2 className="mb-2 text-center text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500">GPF Tracker By Krubell</h2>
        <p className="mb-8 text-center text-sm text-gray-500">
          {isFirst ? "คุณคือผู้ใช้คนแรก จะได้รับสิทธิ์ Admin อัตโนมัติ" : "กรุณาตั้งชื่อเพื่อขอเข้าใช้งานระบบ"}
        </p>
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-teal-800 mb-1">ชื่อของคุณ / นามแฝง</label>
            <input 
              type="text" required 
              className="mt-1 block w-full rounded-xl border border-teal-100 px-4 py-3 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 transition-all text-base"
              value={name} onChange={e => setName(e.target.value)} 
              placeholder="กรอกชื่อเพื่อแสดงในระบบ"
            />
          </div>
          <button 
            type="submit" disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-3 font-medium text-white hover:from-teal-600 hover:to-emerald-600 shadow-md shadow-teal-200 transition-all disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PendingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-teal-50/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-teal-50 text-center relative">
        <button onClick={() => signOut(auth)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <LogOut size={20} />
        </button>
        <Clock size={60} className="mx-auto mb-6 text-orange-300" />
        <h1 className="mb-2 text-2xl font-bold text-gray-800">รอการอนุมัติ</h1>
        <p className="text-gray-600 text-sm">บัญชี Google ของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ<br/>กรุณากลับมาตรวจสอบอีกครั้งภายหลัง</p>
      </div>
    </div>
  );
}

function MainDashboard({ user, profile, records, profiles }) {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-gray-800">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-teal-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-teal-400 to-emerald-400 text-white p-2 rounded-xl shadow-sm hidden sm:block">
                <Wallet size={24} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg sm:text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600 leading-tight">
                  GPF Tracker
                </span>
                <span className="text-xs sm:text-sm font-medium text-teal-500 leading-tight">By Krubell</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-700">สวัสดี, {profile.name}</div>
                {profile.role === 'admin' && <div className="text-xs font-semibold text-teal-600 inline-block">Admin</div>}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col md:flex-row gap-4 sm:gap-8">
        {/* Sidebar Nav (Horizontal on mobile, Vertical on desktop) */}
        <div className="w-full md:w-64 flex-shrink-0">
          <nav className="flex overflow-x-auto md:flex-col gap-2 bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-teal-50 pb-2 md:pb-4">
            <NavItem icon={<TrendingUp size={20}/>} label="แดชบอร์ด" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<Calendar size={20}/>} label="ประวัติย้อนหลัง" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            {profile.role === 'admin' && (
              <NavItem icon={<Users size={20}/>} label="ผู้ใช้งาน" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} badge={profiles.filter(p=>p.status==='pending').length} />
            )}
            <NavItem icon={<Settings size={20}/>} label="ตั้งค่า/ระบบ" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'dashboard' && <DashboardTab user={user} records={records} isFirst={records.length === 0} />}
          {activeTab === 'history' && <HistoryTab user={user} records={records} />}
          {activeTab === 'admin' && profile.role === 'admin' && <AdminTab profiles={profiles} />}
          {activeTab === 'settings' && <SettingsTab user={user} records={records} />}
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 md:w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
        active ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-500 hover:bg-teal-50/50 hover:text-teal-600'
      }`}
    >
      <div className="flex items-center space-x-2 sm:space-x-3">
        <span className={active ? 'text-teal-500' : 'text-gray-400'}>{icon}</span>
        <span className="whitespace-nowrap text-sm sm:text-base">{label}</span>
      </div>
      {badge > 0 && (
        <span className="ml-3 bg-orange-400 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">{badge}</span>
      )}
    </button>
  );
}

// --- TABS ---

function DashboardTab({ user, records, isFirst }) {
  const currentRecord = records.length > 0 ? records[0] : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="ยอดเงินรวมล่าสุด" amount={currentRecord?.totalBalance || 0} icon={<Wallet />} color="teal" />
        <StatCard title="เงินต้นสะสม" amount={currentRecord?.principal || 0} icon={<Calendar />} color="cyan" />
        <StatCard 
          title="กำไร/ขาดทุน สะสม" 
          amount={currentRecord?.totalProfit || 0} 
          percent={currentRecord?.principal > 0 ? (currentRecord.totalProfit / currentRecord.principal) * 100 : 0}
          icon={<TrendingUp />} 
          isProfit={currentRecord?.totalProfit >= 0} 
        />
      </div>

      {/* เปลี่ยนจาก StatCard รายเดือน เป็นกราฟวงกลมเปรียบเทียบ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 h-full">
          <StatCard 
            title="กำไร/ขาดทุน วันนี้" 
            amount={currentRecord?.dailyProfit || 0} 
            percent={currentRecord?.dailyProfitPercent || 0}
            icon={currentRecord?.dailyProfit >= 0 ? <TrendingUp /> : <TrendingDown />} 
            isProfit={currentRecord?.dailyProfit >= 0} 
          />
        </div>
        <div className="lg:col-span-2 h-full">
          <MonthlyPerformanceCard records={records} />
        </div>
      </div>

      <AddRecordForm user={user} isFirst={isFirst} />
    </div>
  );
}

// --- คอมโพเนนต์ใหม่สำหรับสร้างกราฟวงกลม (Donut Chart) ประจำเดือน ---
function MonthlyPerformanceCard({ records }) {
  const { data: monthlyData, totalAbs } = useMemo(() => {
    const dataMap = {};
    records.forEach(r => {
      const dateObj = new Date(r.date);
      const monthKey = r.date.substring(0, 7); // YYYY-MM
      const year = dateObj.getFullYear() + 543;
      const monthIndex = dateObj.getMonth();
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      if (!dataMap[monthKey]) {
        dataMap[monthKey] = {
          id: monthKey,
          label: `${thaiMonths[monthIndex]} ${year.toString().slice(-2)}`,
          profit: 0
        };
      }
      dataMap[monthKey].profit += r.dailyProfit;
    });

    const sortedData = Object.values(dataMap)
      .sort((a, b) => b.id.localeCompare(a.id)) // เรียงจากเดือนล่าสุด
      .slice(0, 6); // แสดงย้อนหลังสูงสุด 6 เดือน

    // ชุดสีแยกตามกำไร (เขียว) และขาดทุน (แดง)
    const posColors = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'];
    const negColors = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3'];
    let posIdx = 0, negIdx = 0;

    const processed = sortedData.map(d => ({
      ...d,
      color: d.profit >= 0 ? posColors[posIdx++ % posColors.length] : negColors[negIdx++ % negColors.length],
      abs: Math.abs(d.profit) // ใช้ค่าสัมบูรณ์ในการวาดขนาดของวงกลม
    }));

    const total = processed.reduce((sum, d) => sum + d.abs, 0);
    return { data: processed, totalAbs: total };
  }, [records]);

  // คำนวณจุดหยุดของการไล่สี (Gradient Stops) สำหรับวาดกราฟ
  let currentPercent = 0;
  const gradientStops = monthlyData.map(d => {
    if (totalAbs === 0) return '';
    const percent = (d.abs / totalAbs) * 100;
    const start = currentPercent;
    const end = currentPercent + percent;
    currentPercent = end;
    return `${d.color} ${start}% ${end}%`;
  }).filter(Boolean).join(', ');

  const formatMoney = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-teal-50 h-full flex flex-col sm:flex-row items-center gap-6 transition-all hover:shadow-md">
      <div className="w-full sm:w-1/2 flex flex-col items-center sm:items-start justify-center">
        <h3 className="text-sm font-medium text-gray-500 mb-1 w-full text-center sm:text-left">สัดส่วนกำไร/ขาดทุน (6 เดือนล่าสุด)</h3>
        <div className="text-[11px] text-gray-400 mb-4 w-full text-center sm:text-left">เทียบจากขนาดของยอดสุทธิในแต่ละเดือน</div>

        <div className="relative w-32 h-32 sm:w-36 sm:h-36 shrink-0 mt-2">
           {totalAbs > 0 ? (
             <div
               className="w-full h-full rounded-full shadow-sm transition-transform hover:scale-105 duration-300"
               style={{ background: `conic-gradient(${gradientStops})` }}
             />
           ) : (
             <div className="w-full h-full rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400">ไม่มีข้อมูล</div>
           )}
           {/* วงกลมตรงกลางเพื่อทำเป็น Donut Chart */}
           <div className="absolute inset-0 m-auto w-[60%] h-[60%] bg-white rounded-full shadow-inner flex items-center justify-center">
             <Wallet className="text-teal-200 w-6 h-6 sm:w-8 sm:h-8 opacity-50" />
           </div>
        </div>
      </div>

      <div className="w-full sm:w-1/2 flex-1 mt-4 sm:mt-0">
         <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
            {monthlyData.length === 0 && <div className="text-sm text-gray-400 text-center py-4">ยังไม่มีประวัติการบันทึก</div>}
            {monthlyData.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: d.color }}></span>
                  <span className="font-medium text-gray-600">{d.label}</span>
                </div>
                <span className={`font-semibold ${d.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {d.profit > 0 ? '+' : ''}{formatMoney(d.profit)}
                </span>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
}

function StatCard({ title, amount, percent, icon, color, isProfit }) {
  const formatMoney = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formatPercent = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  
  let textClass = 'text-gray-800';
  let iconClass = 'text-gray-400 bg-gray-100';

  if (color === 'teal') { iconClass = 'text-teal-600 bg-teal-100/70'; }
  if (color === 'cyan') { iconClass = 'text-cyan-600 bg-cyan-100/70'; }
  if (isProfit === true) { textClass = 'text-emerald-600'; iconClass = 'text-emerald-600 bg-emerald-100/70'; }
  if (isProfit === false) { textClass = 'text-rose-500'; iconClass = 'text-rose-500 bg-rose-100/70'; }

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-teal-50 flex flex-col transition-all hover:shadow-md">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <div className={`p-2 sm:p-2.5 rounded-xl ${iconClass}`}>{icon}</div>
      </div>
      <div className="mt-auto">
        <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${textClass}`}>฿{formatMoney(amount)}</p>
        {percent !== undefined && (
          <p className={`text-sm font-medium mt-1 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isProfit ? '+' : ''}{formatPercent(percent)}%
          </p>
        )}
      </div>
    </div>
  );
}

function AddRecordForm({ user, isFirst }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalBalance, setTotalBalance] = useState('');
  const [addedContribution, setAddedContribution] = useState('');
  const [basePrincipal, setBasePrincipal] = useState(''); 
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!totalBalance) return;
    setLoading(true);
    
    try {
      const recordId = date; 
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', recordId);
      
      const payload = {
        date,
        totalBalance: parseFloat(totalBalance),
        addedContribution: parseFloat(addedContribution || 0),
        timestamp: new Date().toISOString()
      };

      if (isFirst) {
        payload.basePrincipal = parseFloat(basePrincipal || totalBalance);
      }

      await setDoc(docRef, payload);
      
      setTotalBalance('');
      setAddedContribution('');
      setBasePrincipal('');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-teal-50 mt-6">
      <h3 className="text-lg font-bold text-teal-800 mb-4 flex items-center">
        <Plus className="mr-2 text-teal-500" size={20} /> บันทึกยอดประจำวัน
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">วันที่</label>
          <input type="date" required value={date} onChange={e=>setDate(e.target.value)} className="w-full text-base sm:text-sm rounded-xl border border-teal-100 px-4 py-2.5 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ยอดเงินรวมจากแอป (บาท)</label>
          <input type="number" step="0.01" required value={totalBalance} onChange={e=>setTotalBalance(e.target.value)} placeholder="เช่น 150000" className="w-full text-base sm:text-sm rounded-xl border border-teal-100 px-4 py-2.5 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all" />
        </div>
        
        {isFirst ? (
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1.5">เงินต้นสะสมที่ผ่านมา (ถ้ามี)</label>
             <input type="number" step="0.01" value={basePrincipal} onChange={e=>setBasePrincipal(e.target.value)} placeholder="เว้นว่างถ้ายอดรวมคือเงินต้น" className="w-full text-base sm:text-sm rounded-xl border border-teal-100 px-4 py-2.5 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all" />
           </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">เงินสะสมส่วนเพิ่ม (บาท)</label>
            <input type="number" step="0.01" value={addedContribution} onChange={e=>setAddedContribution(e.target.value)} placeholder="เว้นว่างถ้าไม่มีการเพิ่ม" className="w-full text-base sm:text-sm rounded-xl border border-teal-100 px-4 py-2.5 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none transition-all" />
          </div>
        )}

        <button type="submit" disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-medium py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50 h-[46px] shadow-sm shadow-teal-200">
          {loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
        </button>
      </form>
    </div>
  );
}

function HistoryTab({ user, records }) {
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({ totalBalance: '', addedContribution: '', basePrincipal: '' });

  const formatMoney = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formatDate = (d) => new Date(d).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', id));
    } catch (error) {
      console.error(error);
    }
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setEditForm({
      totalBalance: record.totalBalance || '',
      addedContribution: record.addedContribution || '',
      basePrincipal: record.basePrincipal || ''
    });
  };

  const handleUpdateRecord = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        totalBalance: parseFloat(editForm.totalBalance),
        addedContribution: parseFloat(editForm.addedContribution || 0)
      };
      if (editForm.basePrincipal !== '') {
        payload.basePrincipal = parseFloat(editForm.basePrincipal);
      }
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', editingRecord.id), payload);
      setEditingRecord(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-50 overflow-hidden relative">
      <div className="p-5 sm:p-6 border-b border-teal-50">
        <h3 className="text-lg font-bold text-teal-800">ประวัติการบันทึก</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-gray-600">
          <thead className="bg-teal-50/50 text-teal-800 border-b border-teal-100">
            <tr>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">วันที่</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">ยอดรวม</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">เงินต้นสุทธิ</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">ส่วนเพิ่ม(วันนั้น)</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">กำไรรายวัน</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">กำไรสะสม</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-400">ยังไม่มีข้อมูล</td></tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-4 sm:px-6 py-4 text-right font-medium text-gray-900">{formatMoney(r.totalBalance)}</td>
                  <td className="px-4 sm:px-6 py-4 text-right">{formatMoney(r.principal)}</td>
                  <td className="px-4 sm:px-6 py-4 text-right text-gray-400">{r.addedContribution ? `+${formatMoney(r.addedContribution)}` : '-'}</td>
                  <td className={`px-4 sm:px-6 py-4 text-right font-medium whitespace-nowrap ${r.dailyProfit > 0 ? 'text-emerald-500' : r.dailyProfit < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                    {r.dailyProfit > 0 ? '+' : ''}{formatMoney(r.dailyProfit)}
                    <div className="text-[10px] sm:text-xs opacity-75 leading-none mt-1">({r.dailyProfitPercent.toFixed(2)}%)</div>
                  </td>
                  <td className={`px-4 sm:px-6 py-4 text-right font-medium whitespace-nowrap ${r.totalProfit > 0 ? 'text-emerald-500' : r.totalProfit < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                {r.totalProfit > 0 ? '+' : ''}{formatMoney(r.totalProfit)}
              </td>
              <td className="px-4 sm:px-6 py-4 text-center">
                <div className="flex justify-center space-x-2">
                  <button onClick={() => openEditModal(r)} className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors" title="แก้ไขข้อมูล">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors" title="ลบข้อมูล">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>

  {/* Edit Modal */}
  {editingRecord && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-teal-100">
        <h3 className="text-lg font-bold text-teal-800 mb-4">แก้ไขข้อมูลวันที่ {formatDate(editingRecord.date)}</h3>
        <form onSubmit={handleUpdateRecord} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ยอดเงินรวม (บาท)</label>
            <input type="number" step="0.01" required value={editForm.totalBalance} onChange={e => setEditForm({...editForm, totalBalance: e.target.value})} className="w-full rounded-xl border border-teal-100 px-4 py-2 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เงินสะสมส่วนเพิ่ม (บาท)</label>
            <input type="number" step="0.01" value={editForm.addedContribution} onChange={e => setEditForm({...editForm, addedContribution: e.target.value})} className="w-full rounded-xl border border-teal-100 px-4 py-2 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none" />
          </div>
          {editingRecord.basePrincipal !== undefined && editingRecord.basePrincipal !== null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เงินต้นตั้งต้น (บาท)</label>
              <input type="number" step="0.01" value={editForm.basePrincipal} onChange={e => setEditForm({...editForm, basePrincipal: e.target.value})} className="w-full rounded-xl border border-teal-100 px-4 py-2 focus:ring-2 focus:ring-teal-100 focus:border-teal-400 outline-none" />
            </div>
          )}
          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={() => setEditingRecord(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors">ยกเลิก</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 shadow-sm transition-colors">บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  )}
</div>
  );
}

function AdminTab({ profiles }) {
  const [managingUser, setManagingUser] = useState(null);

  const handleUpdateStatus = async (uid, newStatus) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', uid), {
        status: newStatus
      });
    } catch (err) {
      console.error(err);
    }
  };

  const formatDate = (isoStr) => new Date(isoStr).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatMoney = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (managingUser) {
    return <AdminUserEditor targetProfile={managingUser} onClose={() => setManagingUser(null)} />;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-50 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-teal-50 flex items-center justify-between">
        <h3 className="text-lg font-bold text-teal-800">จัดการผู้ใช้งาน</h3>
        <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-medium">รวม {profiles.length} บัญชี</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-gray-600">
          <thead className="bg-teal-50/50 text-teal-800 border-b border-teal-100">
            <tr>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">ชื่อ / นามแฝง</th>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">วันที่สมัคร</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">ยอดล่าสุด</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-right whitespace-nowrap">กำไรสะสม</th>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">สิทธิ์</th>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">สถานะ</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-center whitespace-nowrap">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {profiles.map(p => (
              <tr key={p.uid} className="hover:bg-teal-50/30">
                <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                  {p.name} {p.email && <span className="block text-[10px] text-gray-400 font-normal">{p.email}</span>}
                </td>
                <td className="px-4 sm:px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                <td className="px-4 sm:px-6 py-4 text-right font-medium text-gray-800 whitespace-nowrap">
                  {p.latestBalance !== undefined ? `฿${formatMoney(p.latestBalance)}` : '-'}
                </td>
                <td className={`px-4 sm:px-6 py-4 text-right font-medium whitespace-nowrap ${p.totalProfit > 0 ? 'text-emerald-500' : p.totalProfit < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                  {p.totalProfit !== undefined ? (p.totalProfit > 0 ? `+฿${formatMoney(p.totalProfit)}` : `฿${formatMoney(p.totalProfit)}`) : '-'}
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium ${p.role === 'admin' ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-600'}`}>
                    {p.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                    {p.status === 'approved' ? 'อนุมัติแล้ว' : 'รอตรวจสอบ'}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-4 text-center">
                  <div className="flex justify-center space-x-2">
                    <button onClick={() => setManagingUser(p)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center text-xs transition-colors" title="จัดการข้อมูลผู้ใช้">
                      <Edit size={14} className="mr-1"/> จัดการ
                    </button>
                    {p.role !== 'admin' && (
                      <>
                        {p.status !== 'approved' && (
                          <button onClick={() => handleUpdateStatus(p.uid, 'approved')} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center text-xs transition-colors" title="อนุมัติ">
                            <CheckCircle size={14} className="mr-1"/> อนุมัติ
                          </button>
                        )}
                        {p.status === 'approved' && (
                          <button onClick={() => handleUpdateStatus(p.uid, 'pending')} className="text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg flex items-center text-xs transition-colors" title="ระงับการใช้งาน">
                            <XCircle size={14} className="mr-1"/> ระงับ
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUserEditor({ targetProfile, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    // ดึงข้อมูล gpf_records ของ user เป้าหมาย
    const q = collection(db, 'artifacts', appId, 'users', targetProfile.uid, 'gpf_records');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data);
      setLoading(false);
      setAccessDenied(false);
    }, (err) => {
      // ดักจับ Error หากติดเรื่อง Permission จาก Firebase
      console.error("Access Denied by Firebase Rules:", err);
      setAccessDenied(true);
      setLoading(false);
    });
    return () => unsub();
  }, [targetProfile.uid]);

  const processedRecords = useMemo(() => calculateProcessedRecords(records), [records]);

  if (loading) return <div className="p-8 text-center text-teal-600 animate-pulse">กำลังตรวจสอบสิทธิ์การเข้าถึงข้อมูล...</div>;

  // จำลองตัวแปร user ให้กลายเป็นของ user เป้าหมาย เพื่อให้คอมโพเนนต์ต่างๆ อ่าน/เขียนข้อมูลลงถูกคน
  const mockUser = { uid: targetProfile.uid };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-teal-50">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 bg-gray-50 text-gray-500 rounded-xl hover:bg-teal-50 hover:text-teal-600 transition-colors">
            <XCircle size={24} />
          </button>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-teal-800">จัดการข้อมูล: {targetProfile.name}</h2>
            <p className="text-xs sm:text-sm text-gray-500">{targetProfile.email || targetProfile.uid}</p>
          </div>
        </div>
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">โหมดแอดมิน</span>
      </div>

      {accessDenied ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 sm:p-8 rounded-2xl text-center shadow-sm">
           <h3 className="text-lg font-bold mb-2">เข้าถึงข้อมูลเชิงลึกไม่ได้ (ข้อจำกัดด้านความปลอดภัย)</h3>
           <p className="text-sm max-w-md mx-auto">ระบบฐานข้อมูลไม่อนุญาตให้อ่านหรือแก้ไขประวัติทางการเงินที่อยู่ในโฟลเดอร์ส่วนตัวของผู้อื่นได้ แม้จะมีสิทธิ์ Admin ก็ตาม เพื่อความเป็นส่วนตัวสูงสุดของผู้ใช้</p>
        </div>
      ) : (
        <>
          <DashboardTab user={mockUser} records={processedRecords} isFirst={records.length === 0} />
          <div className="mt-6">
             <HistoryTab user={mockUser} records={processedRecords} />
          </div>
        </>
      )}
    </div>
  );
}

function SettingsTab({ user, records }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleExport = () => {
    const dataToExport = [...records].reverse();
    const headers = ['date', 'totalBalance', 'addedContribution', 'basePrincipal', 'timestamp'];
    const csvRows = [headers.join(',')];

    dataToExport.forEach(row => {
      const values = headers.map(header => {
        const val = row[header] !== undefined && row[header] !== null ? row[header] : '';
        return `"${val}"`; 
      });
      csvRows.push(values.join(','));
    });

    const csvString = csvRows.join('\n');
    const dataStr = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvString); 
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `gpf_backup_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setMsg('กำลังนำเข้าข้อมูล...');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvText = event.target.result;
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length < 2) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง หรือไม่มีข้อมูล");
        
        // 1. ฟังก์ชันช่วยอ่านไฟล์ CSV เผื่อกรณี Excel ใส่ลูกน้ำ (,) มาในตัวเลขที่อยู่ในเครื่องหมายคำพูด
        const parseCSVRow = (row) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < row.length; i++) {
              const char = row[i];
              if (char === '"') {
                  inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                  result.push(current);
                  current = '';
              } else {
                  current += char;
              }
          }
          result.push(current);
          return result.map(s => s.trim().replace(/^"|"$/g, ''));
        };

        // 2. ฟังก์ชันแปลงวันที่จาก Excel ให้กลับมาเป็น YYYY-MM-DD
        const normalizeDate = (dateStr) => {
          if (!dateStr) return null;
          let d = dateStr.trim();
          
          // ตัดเวลาออกถ้ามีแถมมา (เช่น 1/1/2024 00:00)
          d = d.split(' ')[0];

          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; // ถ้าเป็น YYYY-MM-DD อยู่แล้ว
          
          // รองรับตัวคั่นทั้ง / และ -
          if (d.includes('/') || d.includes('-')) {
              const parts = d.split(/[\/-]/);
              if (parts.length === 3) {
                  // ไฟล์ CSV จาก Excel มักจะเป็น เดือน/วัน/ปี (MM/DD/YYYY) จึงตั้งเป็นค่าเริ่มต้น
                  let month = parts[0], day = parts[1], year = parts[2];
                  
                  // ดักจับกรณีปีขึ้นก่อน (YYYY/MM/DD หรือ YYYY-MM-DD)
                  if (parts[0].length === 4) { 
                      year = parts[0]; month = parts[1]; day = parts[2]; 
                  } 
                  // ดักจับกรณีที่ตัวแรกเกิน 12 (แปลว่าเป็น วัน/เดือน/ปี แน่นอน เช่น 15/03/2024)
                  else if (parseInt(parts[0], 10) > 12) {
                      day = parts[0]; month = parts[1];
                  }

                  if (year.length === 2) year = `20${year}`; // ปี 2 หลัก (เช่น 24 -> 2024)
                  if (parseInt(year, 10) > 2500) year = (parseInt(year, 10) - 543).toString(); // กรณีปี พ.ศ. ให้ลบ 543
                  
                  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
          }
          return d.replace(/\//g, '-'); // กันเหนียว เปลี่ยน / เป็น -
        };

        // 3. ฟังก์ชันล้างเครื่องหมายลูกน้ำออกจากตัวเลข
        const parseNumber = (numStr) => {
          if (!numStr) return 0;
          return Number(String(numStr).replace(/,/g, '')) || 0;
        };

        const headers = parseCSVRow(lines[0]);
        let count = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVRow(lines[i]);
          const record = {};
          headers.forEach((h, idx) => { record[h] = values[idx]; });

          const cleanDate = normalizeDate(record.date);

          if (cleanDate && record.totalBalance !== undefined && record.totalBalance !== '') {
             // ใช้ cleanDate ที่แปลงแล้วเป็นชื่อ Document ID
             const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', cleanDate);
             const payload = {
                date: cleanDate,
                totalBalance: parseNumber(record.totalBalance),
                addedContribution: parseNumber(record.addedContribution),
                timestamp: record.timestamp || new Date().toISOString()
             };
             if (record.basePrincipal !== undefined && record.basePrincipal !== '') {
                 payload.basePrincipal = parseNumber(record.basePrincipal);
             }
             
             await setDoc(docRef, payload);
             count++;
          }
        }
        setMsg(`นำเข้าข้อมูลสำเร็จ ${count} รายการ`);
      } catch (error) {
        console.error("Import Error:", error);
        setMsg('เกิดข้อผิดพลาด: ไฟล์ไม่ถูกต้อง หรือข้อมูลสูญหาย');
      }
      setLoading(false);
    };
    reader.readAsText(file); 
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-50 p-5 sm:p-6 space-y-8">
      <div>
        <h3 className="text-lg font-bold text-teal-800 mb-2 sm:mb-4 flex items-center"><Download className="mr-2 text-teal-500"/> สำรองข้อมูล (Export)</h3>
        <p className="text-sm text-gray-500 mb-4">ดาวน์โหลดข้อมูลประวัติทั้งหมดของคุณออกมาเป็นไฟล์ CSV (เปิดใน Excel ได้) เก็บไว้ในเครื่อง</p>
        <button onClick={handleExport} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 sm:py-2.5 px-6 rounded-xl transition-colors shadow-sm">
          ดาวน์โหลดไฟล์ Backup (.csv)
        </button>
      </div>

      <div className="pt-6 border-t border-teal-50">
        <h3 className="text-lg font-bold text-teal-800 mb-2 sm:mb-4 flex items-center"><Upload className="mr-2 text-teal-500"/> นำเข้าข้อมูล (Import)</h3>
        <p className="text-sm text-gray-500 mb-4">การนำเข้าข้อมูลที่มีวันที่ซ้ำกับของเดิม ระบบจะทำการ<span className="text-rose-500">เขียนทับ</span>ข้อมูลในวันนั้น</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <label className="w-full sm:w-auto text-center bg-teal-50 text-teal-600 hover:bg-teal-100 font-medium py-3 sm:py-2.5 px-6 rounded-xl transition-colors cursor-pointer border border-teal-100">
            เลือกไฟล์ CSV
            <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={loading} />
          </label>
          {loading && <span className="text-sm text-gray-500">กำลังประมวลผล...</span>}
          {msg && !loading && <span className={`text-sm ${msg.includes('สำเร็จ') ? 'text-emerald-500' : 'text-rose-500'}`}>{msg}</span>}
        </div>
      </div>

      <div className="pt-6 border-t border-teal-50">
        <h3 className="text-lg font-bold text-rose-600 mb-2 sm:mb-4 flex items-center"><LogOut className="mr-2 text-rose-500" size={20}/> ออกจากระบบ</h3>
        <button onClick={() => {signOut(getAuth())}} className="w-full sm:w-auto bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium py-3 sm:py-2.5 px-6 rounded-xl transition-colors border border-rose-100">
          ออกจากระบบ (Logout)
        </button>
      </div>
    </div>
  );
}