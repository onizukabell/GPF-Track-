import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';
import { 
  Wallet, TrendingUp, TrendingDown, Calendar, Users, Settings, 
  Plus, Trash2, Download, Upload, CheckCircle, XCircle, Clock
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
const appId = "gpf-tracker-by-krubell"; // ชื่อนี้จะเป็นชื่อ Collection หลักใน Database ของคุณ

export default function App() {
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth); // สั่งให้ล็อกอินแบบ Anonymous ทันที
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
  const processedRecords = useMemo(() => {
    let runningPrincipal = 0;
    let prevBalance = 0;

    return [...records]
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
      .reverse(); // Reverse for display (newest first)
  }, [records]);

  // --- Views Controller ---
  if (loading) return <div className="flex h-screen items-center justify-center bg-teal-50"><div className="text-xl text-teal-600 animate-pulse">กำลังโหลดข้อมูล...</div></div>;
  if (!user) return <div className="flex h-screen items-center justify-center bg-teal-50 text-teal-600">กรุณารอสักครู่...</div>;
  if (!currentProfile) return <RegisterScreen user={user} isFirst={profiles.length === 0} />;
  if (currentProfile.status === 'pending') return <PendingScreen />;
  
  return <MainDashboard user={user} profile={currentProfile} records={processedRecords} profiles={profiles} />;
}

// ============================================================================
// COMPONENTS
// ============================================================================

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
        createdAt: new Date().toISOString()
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
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-800">ยินดีต้อนรับสู่ระบบ</h1>
        <h2 className="mb-2 text-center text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500">GPF Tracker By Krubell</h2>
        <p className="mb-8 text-center text-sm text-gray-500">
          {isFirst ? "คุณคือผู้ใช้คนแรก จะได้รับสิทธิ์ Admin อัตโนมัติ" : "กรุณาลงทะเบียนเพื่อขอเข้าใช้งาน"}
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
            {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนเข้าใช้งาน'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PendingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-teal-50/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-teal-50 text-center">
        <Clock size={60} className="mx-auto mb-6 text-orange-300" />
        <h1 className="mb-2 text-2xl font-bold text-gray-800">รอการอนุมัติ</h1>
        <p className="text-gray-600 text-sm">บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ<br/>กรุณากลับมาตรวจสอบอีกครั้งภายหลัง</p>
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
            <NavItem icon={<Settings size={20}/>} label="ตั้งค่า/สำรองข้อมูล" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
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

  // Monthly Calculation
  const currentMonthPrefix = new Date().toISOString().substring(0, 7);
  const currentMonthRecords = records.filter(r => r.date.startsWith(currentMonthPrefix));
  const monthlyProfit = currentMonthRecords.reduce((sum, r) => sum + r.dailyProfit, 0);
  
  const lastMonthRecords = records.filter(r => r.date < currentMonthPrefix + '-01');
  const lastMonthFinalBalance = lastMonthRecords.length > 0 ? lastMonthRecords[0].totalBalance : 0; 
  const monthlyProfitPercent = lastMonthFinalBalance > 0 ? (monthlyProfit / lastMonthFinalBalance) * 100 : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard 
          title="กำไร/ขาดทุน วันนี้" 
          amount={currentRecord?.dailyProfit || 0} 
          percent={currentRecord?.dailyProfitPercent || 0}
          icon={currentRecord?.dailyProfit >= 0 ? <TrendingUp /> : <TrendingDown />} 
          isProfit={currentRecord?.dailyProfit >= 0} 
        />
        <StatCard 
          title="กำไร/ขาดทุน เดือนนี้" 
          amount={monthlyProfit} 
          percent={monthlyProfitPercent}
          icon={monthlyProfit >= 0 ? <TrendingUp /> : <TrendingDown />} 
          isProfit={monthlyProfit >= 0} 
        />
      </div>

      <AddRecordForm user={user} isFirst={isFirst} />
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
  const formatMoney = (n) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formatDate = (d) => new Date(d).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', id));
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-50 overflow-hidden">
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
                    <button onClick={() => handleDelete(r.id)} className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors" title="ลบข้อมูล">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminTab({ profiles }) {
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
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">สิทธิ์</th>
              <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">สถานะ</th>
              <th className="px-4 sm:px-6 py-3 font-semibold text-center whitespace-nowrap">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {profiles.map(p => (
              <tr key={p.uid} className="hover:bg-teal-50/30">
                <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                <td className="px-4 sm:px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt)}</td>
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
                  {p.role !== 'admin' && (
                    <div className="flex justify-center space-x-2">
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
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        let count = 0;
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          const record = {};
          headers.forEach((h, idx) => { record[h] = values[idx]; });

          if (record.date && record.totalBalance !== undefined && record.totalBalance !== '') {
             const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'gpf_records', record.date);
             const payload = {
                date: record.date,
                totalBalance: Number(record.totalBalance),
                addedContribution: Number(record.addedContribution || 0),
                timestamp: record.timestamp || new Date().toISOString()
             };
             if (record.basePrincipal !== undefined && record.basePrincipal !== '') {
                 payload.basePrincipal = Number(record.basePrincipal);
             }
             
             await setDoc(docRef, payload);
             count++;
          }
        }
        setMsg(`นำเข้าข้อมูลสำเร็จ ${count} รายการ`);
      } catch (error) {
        console.error(error);
        setMsg('เกิดข้อผิดพลาด: ไฟล์ไม่ถูกต้อง');
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
    </div>
  );
}