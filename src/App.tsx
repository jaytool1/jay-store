import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { auth, db, signInWithGoogle, logout } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, onSnapshot, orderBy, addDoc, updateDoc, deleteDoc, where, collectionGroup } from "firebase/firestore";
import { Search, Menu, User as UserIcon, Star, Download, Plus, Edit, Trash, ChevronRight, LayoutDashboard, Package, ListTree, Users, MessageSquare, LogOut, Sun, Moon, LifeBuoy, Send, CheckCircle2, Clock, Database } from "lucide-react";
import { motion, AnimatePresence, useScroll, useSpring } from "motion/react";
import { cn } from "./lib/utils";

// --- Animation Variants ---

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3, ease: "easeIn" as const } }
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className="w-full"
  >
    {children}
  </motion.div>
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We can also show a toast or alert here if needed
}

async function testConnection() {
  try {
    const { getDocFromServer, doc } = await import("firebase/firestore");
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

// --- Components ---

const ProtectedRoute = ({ user, isAdmin, adminOnly = false, children }: { user: any, isAdmin: boolean, adminOnly?: boolean, children: React.ReactNode }) => {
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
};

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  variant = "danger"
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string,
  variant?: "danger" | "success" | "primary"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200 dark:border-zinc-800"
      >
        <h3 className="text-xl font-bold dark:text-white mb-2">{title}</h3>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 dark:text-white font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {cancelText}
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "flex-1 px-4 py-2 rounded-xl text-white font-medium transition-colors",
              variant === "danger" ? "bg-red-600 hover:bg-red-700" :
              variant === "success" ? "bg-green-600 hover:bg-green-700" :
              "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Navbar = ({ user, isAdmin, toggleDarkMode, isDarkMode }: { user: User | null, isAdmin: boolean, toggleDarkMode: () => void, isDarkMode: boolean }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsMenuOpen(true)} 
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full md:hidden"
          >
            <Menu className="w-6 h-6 dark:text-white" />
          </motion.button>
          <Link to="/" className="flex items-center gap-2 group">
            <motion.div 
              whileHover={{ rotate: 45 }}
              className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center"
            >
              <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
            </motion.div>
            <span className="text-xl font-semibold dark:text-white hidden sm:block group-hover:text-green-600 transition-colors">Jay Store</span>
          </Link>
        </div>

        <div className="flex-1 max-w-2xl mx-4 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search for apps & games"
              className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-green-600 dark:text-white transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button 
            whileHover={{ rotate: 15 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleDarkMode} 
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
          >
            {isDarkMode ? <Sun className="w-6 h-6 text-white" /> : <Moon className="w-6 h-6 text-zinc-600" />}
          </motion.button>
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/upload-app" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-green-600 hidden sm:block transition-colors">
                Upload App
              </Link>
              <Link to="/support" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-green-600 hidden sm:block transition-colors">
                Support
              </Link>
              {isAdmin && (
                <Link to="/admin" className="text-sm font-medium text-green-600 hover:text-green-700 hidden sm:block transition-colors">
                  Admin Panel
                </Link>
              )}
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/profile")} 
                className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200"
              >
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-full h-full object-cover" />
              </motion.button>
            </div>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/login"
                className="bg-green-600 text-white px-6 py-2 rounded-full font-medium hover:bg-green-700 transition-colors block"
              >
                Sign in
              </Link>
            </motion.div>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-[100] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              className="absolute top-0 left-0 bottom-0 w-72 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-10">
                <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
                  </div>
                  <span className="text-xl font-bold dark:text-white">Jay Store</span>
                </Link>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                  <LogOut className="w-6 h-6 dark:text-white rotate-180" />
                </button>
              </div>

              <div className="space-y-2">
                <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-white font-medium">
                  <Package className="w-6 h-6" /> Home
                </Link>
                {user && (
                  <>
                    <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-white font-medium">
                      <UserIcon className="w-6 h-6" /> Profile
                    </Link>
                    <Link to="/support" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-white font-medium">
                      <LifeBuoy className="w-6 h-6" /> Support
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 font-bold">
                        <LayoutDashboard className="w-6 h-6" /> Admin Panel
                      </Link>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const LoginPage = ({ user }: { user: User | null }) => {
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      setError("");
      await signInWithGoogle();
      navigate("/");
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === "auth/popup-blocked") {
        setError("Popup was blocked by your browser. Please allow popups for this site.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("This domain is not authorized for Firebase Auth. Please check your Firebase Console settings.");
      } else {
        setError("An error occurred during sign-in. Please try again.");
      }
    }
  };

  return (
    <PageWrapper>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="max-w-md w-full bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl border border-zinc-100 dark:border-zinc-800 text-center"
        >
          <motion.div 
            whileHover={{ rotate: 10, scale: 1.1 }}
            className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6"
          >
            <div className="w-8 h-8 bg-white rounded-sm rotate-45" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2 dark:text-white">Sign in to Play Store</h1>
          <p className="text-zinc-500 mb-8">Access your apps, games, and reviews from any device.</p>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-xs p-3 rounded-xl mb-6">
            Note: Currently, only Google Sign-in is supported. If you don't have an account, one will be created automatically.
          </div>

          {error && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="bg-red-50 dark:bg-red-900/20 text-red-600 text-sm p-4 rounded-xl mb-6 overflow-hidden"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 py-3 rounded-xl font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors dark:text-white mb-4"
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </span>
          </motion.button>
          
          <p className="text-xs text-zinc-400">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </PageWrapper>
  );
};

const UploadAppPage = ({ user }: { user: User | null }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    icon: "",
    developer: "",
    apk_file: "",
    version: "1.0.0"
  });
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "categories"));
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "apps"), {
        ...formData,
        status: "pending",
        authorId: user.uid,
        downloads: 0,
        rating: 0,
        createdAt: new Date().toISOString()
      });
      alert("App submitted successfully! It will be visible once approved by an admin.");
      navigate("/profile");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "apps");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <Navigate to="/login" />;

  return (
    <PageWrapper>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-100 dark:border-zinc-800 shadow-xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-xl flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold dark:text-white">Upload New App</h1>
              <p className="text-sm text-zinc-500">Submit your app for review</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">App Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="e.g. My Awesome App"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Developer Name</label>
                <input
                  type="text"
                  required
                  value={formData.developer}
                  onChange={e => setFormData({ ...formData, developer: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="Your Name or Company"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Category</label>
                <select
                  required
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="Tell users what your app does..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Icon URL</label>
                <input
                  type="url"
                  required
                  value={formData.icon}
                  onChange={e => setFormData({ ...formData, icon: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="https://example.com/icon.png"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">APK File URL</label>
                <input
                  type="url"
                  required
                  value={formData.apk_file}
                  onChange={e => setFormData({ ...formData, apk_file: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="https://example.com/app.apk"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit for Review"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
};
const ProfilePage = ({ user, isAdmin }: { user: User | null, isAdmin: boolean }) => {
  const [userApps, setUserApps] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "apps"), where("authorId", "==", user.uid));
    return onSnapshot(q, s => setUserApps(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "apps"));
  }, [user]);

  if (!user) return <Navigate to="/login" />;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="lg:col-span-1"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-100 dark:border-zinc-800 text-center sticky top-24">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-6 border-4 border-green-500/20"
              >
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-full h-full object-cover" />
              </motion.div>
              <h1 className="text-2xl font-bold dark:text-white mb-1">{user.displayName}</h1>
              <p className="text-zinc-500 mb-8">{user.email}</p>
              
              <div className="space-y-3">
                {isAdmin && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/admin")}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-medium hover:bg-green-700 py-3 rounded-xl transition-colors"
                  >
                    <LayoutDashboard className="w-5 h-5" /> Admin Panel
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                  className="w-full flex items-center justify-center gap-2 text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 py-3 rounded-xl transition-colors"
                >
                  <LogOut className="w-5 h-5" /> Sign out
                </motion.button>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="lg:col-span-2 space-y-8"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold dark:text-white">My Uploaded Apps</h2>
                <Link to="/upload-app" className="text-sm font-medium text-green-600 hover:underline flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Upload New
                </Link>
              </div>

              {userApps.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                  <p className="text-zinc-500 mb-4">You haven't uploaded any apps yet.</p>
                  <Link to="/upload-app" className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-xl hover:bg-green-700 transition-colors">
                    <Plus className="w-5 h-5" /> Upload Your First App
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {userApps.map(app => (
                    <motion.div 
                      key={app.id}
                      whileHover={{ scale: 1.01 }}
                      className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700"
                    >
                      <div className="flex items-center gap-4">
                        <img src={app.icon} className="w-12 h-12 rounded-xl object-cover" />
                        <div>
                          <h3 className="font-bold dark:text-white">{app.name}</h3>
                          <p className="text-xs text-zinc-500">{app.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium",
                          app.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          app.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        )}>
                          {app.status?.toUpperCase() || "PENDING"}
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {new Date(app.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
};

// --- Pages ---

const HomePage = () => {
  const [apps, setApps] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appsQuery = query(collection(db, "apps"), where("status", "==", "approved"), orderBy("createdAt", "desc"));
    const unsubscribeApps = onSnapshot(appsQuery, (snapshot) => {
      setApps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "apps");
      setLoading(false);
    });

    const categoriesQuery = query(collection(db, "categories"));
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "categories");
    });

    return () => {
      unsubscribeApps();
      unsubscribeCategories();
    };
  }, []);

  if (loading) return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" /></div>;

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 dark:text-white">Featured Apps</h2>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6"
          >
            {apps.map((app) => (
              <motion.div key={app.id} variants={itemVariants}>
                <Link to={`/app/${app.id}`} className="group block">
                  <motion.div 
                    whileHover={{ y: -8, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    className="aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-hidden mb-3 group-hover:shadow-xl transition-shadow"
                  >
                    <img src={app.icon} alt={app.name} className="w-full h-full object-cover" />
                  </motion.div>
                  <h3 className="font-medium text-sm truncate dark:text-white">{app.name}</h3>
                  <p className="text-xs text-zinc-500 truncate">{app.developer}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs font-medium dark:text-zinc-400">{app.rating || "0"}</span>
                    <Star className="w-3 h-3 fill-zinc-400 text-zinc-400" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6 dark:text-white">Categories</h2>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-wrap gap-3"
          >
            {categories.map((cat) => (
              <motion.div key={cat.id} variants={itemVariants}>
                <Link
                  to={`/category/${cat.id}`}
                  className="px-6 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-white transition-colors block"
                >
                  {cat.name}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </div>
    </PageWrapper>
  );
};

const AppDetailsPage = ({ user }: { user: User | null }) => {
  const { id } = useParams();
  const [app, setApp] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: "" });

  useEffect(() => {
    if (!id) return;
    const appRef = doc(db, "apps", id);
    getDoc(appRef).then(docSnap => {
      if (docSnap.exists()) setApp({ id: docSnap.id, ...docSnap.data() });
    }).catch(error => {
      handleFirestoreError(error, OperationType.GET, `apps/${id}`);
    });

    const reviewsQuery = query(collection(db, `apps/${id}/reviews`), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(reviewsQuery, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.GET, "reviews"));

    return () => unsubscribe();
  }, [id]);

  const handleDownload = async () => {
    if (!id || !app) return;
    await updateDoc(doc(db, "apps", id), {
      downloads: (app.downloads || 0) + 1
    });
    window.open(app.apk_file, "_blank");
  };

  const submitReview = async () => {
    if (!user || !id || !app) return;
    try {
      const reviewData = {
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        rating: newReview.rating,
        comment: newReview.comment,
        createdAt: new Date().toISOString()
      };
      
      await addDoc(collection(db, `apps/${id}/reviews`), reviewData);
      
      // Update overall rating
      const allReviews = [...reviews, reviewData];
      const avgRating = allReviews.reduce((acc, curr) => acc + curr.rating, 0) / allReviews.length;
      const roundedRating = Math.round(avgRating * 10) / 10;
      
      await updateDoc(doc(db, "apps", id), {
        rating: roundedRating
      });
      
      setNewReview({ rating: 5, comment: "" });
      alert("Review submitted successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `apps/${id}/reviews`);
    }
  };

  if (!app) return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" /></div>;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8 mb-12">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="w-32 h-32 md:w-48 md:h-48 bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden shrink-0 shadow-lg"
          >
            <img src={app.icon} alt={app.name} className="w-full h-full object-cover" />
          </motion.div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <motion.h1 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="text-3xl font-bold dark:text-white"
              >
                {app.name}
              </motion.h1>
              {app.status && app.status !== "approved" && (
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  app.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                )}>
                  {app.status.toUpperCase()}
                </span>
              )}
            </div>
            <motion.p 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-green-600 font-medium mb-4"
            >
              {app.developer}
            </motion.p>
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex gap-8 mb-8 border-y border-zinc-100 dark:border-zinc-800 py-4"
            >
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 font-bold dark:text-white">
                  {app.rating || "0"} <Star className="w-4 h-4 fill-current" />
                </div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Rating</p>
              </div>
              <div className="text-center">
                <div className="font-bold dark:text-white">{app.downloads || "0"}</div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Downloads</p>
              </div>
              <div className="text-center">
                <div className="font-bold dark:text-white">{app.version || "1.0.0"}</div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Version</p>
              </div>
            </motion.div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="w-full md:w-auto bg-green-600 text-white px-12 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
            >
              Install
            </motion.button>
          </div>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="text-xl font-bold mb-4 dark:text-white">About this app</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{app.description}</p>
        </motion.div>

        <div className="mb-12">
          <h2 className="text-xl font-bold mb-6 dark:text-white">Ratings and reviews</h2>
          {user ? (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              className="bg-zinc-50 dark:bg-zinc-800 p-6 rounded-2xl mb-8"
            >
              <h3 className="font-medium mb-4 dark:text-white">Rate this app</h3>
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5].map(star => (
                  <motion.button 
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    key={star} 
                    onClick={() => setNewReview({ ...newReview, rating: star })}
                  >
                    <Star className={cn("w-8 h-8", newReview.rating >= star ? "fill-green-600 text-green-600" : "text-zinc-300")} />
                  </motion.button>
                ))}
              </div>
              <textarea
                placeholder="Describe your experience (optional)"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 mb-4 dark:text-white"
                rows={3}
                value={newReview.comment}
                onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={submitReview}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700"
              >
                Post
              </motion.button>
            </motion.div>
          ) : (
            <p className="text-zinc-500 mb-8">Sign in to write a review.</p>
          )}

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="space-y-6"
          >
            {reviews.map(review => (
              <motion.div key={review.id} variants={itemVariants} className="flex gap-4">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                  <img src={review.userPhoto} alt={review.userName} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm dark:text-white">{review.userName}</span>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={cn("w-3 h-3", i < review.rating ? "fill-zinc-600 text-zinc-600" : "text-zinc-200")} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{review.comment}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
};

// --- Admin Components ---

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  return (
    <PageWrapper>
      <div className="flex flex-col md:flex-row min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Mobile Admin Nav */}
        <div className="md:hidden flex items-center gap-4 overflow-x-auto p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 scrollbar-hide">
          <Link to="/admin" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
          <Link to="/admin/apps" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <Package className="w-4 h-4" /> Apps
          </Link>
          <Link to="/admin/categories" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <ListTree className="w-4 h-4" /> Categories
          </Link>
          <Link to="/admin/users" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <Users className="w-4 h-4" /> Users
          </Link>
          <Link to="/admin/reviews" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <MessageSquare className="w-4 h-4" /> Reviews
          </Link>
          <Link to="/admin/support" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium dark:text-white">
            <LifeBuoy className="w-4 h-4" /> Support
          </Link>
        </div>

        <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-6 hidden md:block">
          <div className="flex items-center gap-2 mb-10">
            <motion.div 
              whileHover={{ rotate: 90 }}
              className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center"
            >
              <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
            </motion.div>
            <span className="text-xl font-bold dark:text-white">Jay Store Admin</span>
          </div>
          <nav className="space-y-2">
            {[
              { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
              { to: "/admin/apps", icon: Package, label: "Apps" },
              { to: "/admin/categories", icon: ListTree, label: "Categories" },
              { to: "/admin/users", icon: Users, label: "Users" },
              { to: "/admin/reviews", icon: MessageSquare, label: "Reviews" },
              { to: "/admin/support", icon: LifeBuoy, label: "Support" },
            ].map((item) => (
              <Link 
                key={item.to}
                to={item.to} 
                className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium transition-all hover:translate-x-1"
              >
                <item.icon className="w-5 h-5" /> {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </PageWrapper>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState({ apps: 0, users: 0, reviews: 0 });

  useEffect(() => {
    const unsubApps = onSnapshot(collection(db, "apps"), s => setStats(prev => ({ ...prev, apps: s.size })), (err) => handleFirestoreError(err, OperationType.GET, "apps"));
    const unsubUsers = onSnapshot(collection(db, "users"), s => setStats(prev => ({ ...prev, users: s.size })), (err) => handleFirestoreError(err, OperationType.GET, "users"));
    const unsubReviews = onSnapshot(collectionGroup(db, "reviews"), s => setStats(prev => ({ ...prev, reviews: s.size })), (err) => handleFirestoreError(err, OperationType.GET, "reviews"));
    return () => { unsubApps(); unsubUsers(); unsubReviews(); };
  }, []);

  return (
    <AdminLayout>
      <motion.h1 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="text-3xl font-bold mb-8 dark:text-white"
      >
        Admin Dashboard
      </motion.h1>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {[
          { label: "Total Apps", value: stats.apps, icon: Package, color: "blue" },
          { label: "Total Users", value: stats.users, icon: Users, color: "green" },
          { label: "Total Reviews", value: stats.reviews, icon: MessageSquare, color: "purple" },
        ].map((stat) => (
          <motion.div 
            key={stat.label}
            variants={itemVariants}
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors",
              stat.color === "blue" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" :
              stat.color === "green" ? "bg-green-100 dark:bg-green-900/30 text-green-600" :
              "bg-purple-100 dark:bg-purple-900/30 text-purple-600"
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div className="text-3xl font-bold dark:text-white">{stat.value}</div>
            <div className="text-zinc-500 text-sm">{stat.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </AdminLayout>
  );
};

const AdminApps = () => {
  const [apps, setApps] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);
  const [newApp, setNewApp] = useState({ name: "", description: "", category: "", icon: "", developer: "", apk_file: "", version: "1.0.0", rating: 0 });

  useEffect(() => {
    const unsubApps = onSnapshot(collection(db, "apps"), s => setApps(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "apps"));
    const unsubCats = onSnapshot(collection(db, "categories"), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "categories"));
    return () => { unsubApps(); unsubCats(); };
  }, []);

  const handleAddApp = async () => {
    if (!auth.currentUser) return;
    if (!newApp.name || !newApp.category || !newApp.developer) {
      alert("Please fill in all required fields (Name, Category, Developer)");
      return;
    }

    try {
      await addDoc(collection(db, "apps"), { 
        ...newApp, 
        downloads: 0, 
        status: "approved", 
        authorId: auth.currentUser.uid,
        createdAt: new Date().toISOString() 
      });
      setIsAdding(false);
      setNewApp({ name: "", description: "", category: "", icon: "", developer: "", apk_file: "", version: "1.0.0", rating: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "apps");
    }
  };

  const handleSeedApps = async () => {
    if (!auth.currentUser) return;
    
    try {
      const popularApps = [
        { id: "whatsapp", name: "WhatsApp", description: "Simple. Personal. Secure. WhatsApp is a free messaging and video calling app used by over 2B people in more than 180 countries.", category: "Social", icon: "https://picsum.photos/seed/whatsapp/200/200", developer: "Meta", apk_file: "https://example.com/whatsapp.apk", rating: 4.8, downloads: 5000000, version: "2.24.5.76", status: "approved" },
        { id: "instagram", name: "Instagram", description: "Bringing you closer to the people and things you love. Connect with friends, share what you're up to, or see what's new from others all over the world.", category: "Social", icon: "https://picsum.photos/seed/instagram/200/200", developer: "Meta", apk_file: "https://example.com/instagram.apk", rating: 4.7, downloads: 1000000, version: "321.0.0.33", status: "approved" },
        { id: "facebook", name: "Facebook", description: "Connect with friends, family and people who share the same interests as you. Communicate privately, watch your favorite content, buy and sell items.", category: "Social", icon: "https://picsum.photos/seed/facebook/200/200", developer: "Meta", apk_file: "https://example.com/facebook.apk", rating: 4.1, downloads: 5000000, version: "453.0.0.44", status: "approved" },
        { id: "tiktok", name: "TikTok", description: "TikTok is the destination for mobile videos. On TikTok, short-form videos are exciting, spontaneous, and genuine.", category: "Social", icon: "https://picsum.photos/seed/tiktok/200/200", developer: "ByteDance", apk_file: "https://example.com/tiktok.apk", rating: 4.4, downloads: 1000000, version: "33.8.4", status: "approved" },
        { id: "youtube", name: "YouTube", description: "Get the official YouTube app on Android phones and tablets. See what the world is watching -- from the hottest music videos to what’s trending in gaming, fashion, beauty, news, learning and more.", category: "Social", icon: "https://picsum.photos/seed/youtube/200/200", developer: "Google LLC", apk_file: "https://example.com/youtube.apk", rating: 4.5, downloads: 10000000, version: "19.08.35", status: "approved" },
        { id: "spotify", name: "Spotify", description: "With the Spotify music and podcast app, you can play millions of songs, albums and original podcasts for free.", category: "Tools", icon: "https://picsum.photos/seed/spotify/200/200", developer: "Spotify AB", apk_file: "https://example.com/spotify.apk", rating: 4.6, downloads: 1000000, version: "8.9.18.612", status: "approved" },
        { id: "netflix", name: "Netflix", description: "Netflix is the leading subscription service for watching TV episodes and movies on your favorite device.", category: "Tools", icon: "https://picsum.photos/seed/netflix/200/200", developer: "Netflix, Inc.", apk_file: "https://example.com/netflix.apk", rating: 4.4, downloads: 1000000, version: "8.104.0", status: "approved" },
        { id: "zoom", name: "Zoom", description: "Stay connected wherever you go – start or join a secure meeting with flawless video and audio, instant screen sharing, and cross-platform instant messaging.", category: "Tools", icon: "https://picsum.photos/seed/zoom/200/200", developer: "zoom.us", apk_file: "https://example.com/zoom.apk", rating: 4.3, downloads: 500000, version: "5.17.10", status: "approved" },
        { id: "snapchat", name: "Snapchat", description: "Snapchat is a fast and fun way to share the moment with your best friends and family.", category: "Social", icon: "https://picsum.photos/seed/snapchat/200/200", developer: "Snap Inc", apk_file: "https://example.com/snapchat.apk", rating: 4.2, downloads: 1000000, version: "12.74.0.35", status: "approved" },
        { id: "telegram", name: "Telegram", description: "Pure instant messaging — simple, fast, secure, and synced across all your devices. One of the world's top 10 most downloaded apps with over 800 million active users.", category: "Social", icon: "https://picsum.photos/seed/telegram/200/200", developer: "Telegram FZ-LLC", apk_file: "https://example.com/telegram.apk", rating: 4.5, downloads: 1000000, version: "10.8.3", status: "approved" },
        { id: "pinterest", name: "Pinterest", description: "Pinterest is the place to explore inspiration. You can: Discover new ideas, Save what inspires you, Shop to make them yours, and Share what you love.", category: "Social", icon: "https://picsum.photos/seed/pinterest/200/200", developer: "Pinterest", apk_file: "https://example.com/pinterest.apk", rating: 4.6, downloads: 500000, version: "12.9.0", status: "approved" },
        { id: "linkedin", name: "LinkedIn", description: "LinkedIn is the world's largest professional network on the internet. You can use LinkedIn to find the right job or internship, connect and strengthen professional relationships.", category: "Social", icon: "https://picsum.photos/seed/linkedin/200/200", developer: "LinkedIn", apk_file: "https://example.com/linkedin.apk", rating: 4.3, downloads: 1000000, version: "4.1.916", status: "approved" },
        { id: "twitter", name: "X (Twitter)", description: "The X app is the trusted digital town square for everyone. With X, you can: Post content for the world to see and join public conversations.", category: "Social", icon: "https://picsum.photos/seed/twitter/200/200", developer: "X Corp.", apk_file: "https://example.com/twitter.apk", rating: 4.0, downloads: 1000000, version: "10.30.0", status: "approved" },
        { id: "discord", name: "Discord", description: "Discord is where you can make a home for your communities and friends. Where you can stay close and have fun over text, voice, and video.", category: "Social", icon: "https://picsum.photos/seed/discord/200/200", developer: "Discord Inc.", apk_file: "https://example.com/discord.apk", rating: 4.7, downloads: 1000000, version: "218.15", status: "approved" },
        { id: "reddit", name: "Reddit", description: "Reddit is where people come together to have the most authentic and interesting conversations on the internet.", category: "Social", icon: "https://picsum.photos/seed/reddit/200/200", developer: "redditinc", apk_file: "https://example.com/reddit.apk", rating: 4.4, downloads: 100000, version: "2024.08.0", status: "approved" },
        { id: "uber", name: "Uber", description: "We’re committed to your safety at Uber. We’ve established a Door-to-Door Safety Standard to help you feel safe every time you ride.", category: "Tools", icon: "https://picsum.photos/seed/uber/200/200", developer: "Uber Technologies, Inc.", apk_file: "https://example.com/uber.apk", rating: 4.6, downloads: 500000, version: "4.510.10002", status: "approved" },
        { id: "airbnb", name: "Airbnb", description: "Find vacation rentals, cabins, beach houses, unique homes and experiences around the world - all made possible by hosts on Airbnb.", category: "Tools", icon: "https://picsum.photos/seed/airbnb/200/200", developer: "Airbnb", apk_file: "https://example.com/airbnb.apk", rating: 4.8, downloads: 100000, version: "24.08", status: "approved" },
        { id: "duolingo", name: "Duolingo", description: "Learn a new language with the world’s most-downloaded education app! Duolingo is the fun, free app for learning 35+ languages through quick, bite-sized lessons.", category: "Education", icon: "https://picsum.photos/seed/duolingo/200/200", developer: "Duolingo", apk_file: "https://example.com/duolingo.apk", rating: 4.7, downloads: 500000, version: "5.141.2", status: "approved" },
        { id: "canva", name: "Canva", description: "Canva is your free photo editor, logo maker, and video editor in one design app! Create stunning social media posts, cards, flyers, photo collages & more.", category: "Tools", icon: "https://picsum.photos/seed/canva/200/200", developer: "Canva", apk_file: "https://example.com/canva.apk", rating: 4.8, downloads: 1000000, version: "2.254.0", status: "approved" },
        { id: "capcut", name: "CapCut", description: "CapCut is a free all-in-one video editor and video maker app with everything you need to create stunning, high-quality videos.", category: "Tools", icon: "https://picsum.photos/seed/capcut/200/200", developer: "Bytedance", apk_file: "https://example.com/capcut.apk", rating: 4.5, downloads: 500000, version: "11.2.0", status: "approved" }
      ];

      for (const app of popularApps) {
        const { id, ...appData } = app;
        await setDoc(doc(db, "apps", id), {
          ...appData,
          authorId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      }
      alert("20 Popular Apps seeded successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "apps/seed");
    }
  };

  const handleUpdateApp = async () => {
    if (!editingApp) return;
    try {
      const { id, ...updateData } = editingApp;
      await updateDoc(doc(db, "apps", id), updateData);
      setEditingApp(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `apps/${editingApp.id}`);
    }
  };

  const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateDoc(doc(db, "apps", id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `apps/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "apps", id));
      setDeletingAppId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `apps/${id}`);
    }
  };

  return (
    <AdminLayout>
      <ConfirmationModal 
        isOpen={!!deletingAppId}
        onClose={() => setDeletingAppId(null)}
        onConfirm={() => deletingAppId && handleDelete(deletingAppId)}
        title="Delete App"
        message="Are you sure you want to delete this app? This action cannot be undone."
      />
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold dark:text-white">Manage Apps</h1>
        <div className="flex gap-3">
          <button 
            onClick={handleSeedApps} 
            className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Database className="w-5 h-5" /> Seed Popular Apps
          </button>
          <button onClick={() => setIsAdding(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700">
            <Plus className="w-5 h-5" /> Add New App
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">App</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Category</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Rating</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Status</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {apps.map(app => (
              <tr key={app.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={app.icon} className="w-10 h-10 rounded-lg object-cover" />
                    <div>
                      <div className="font-medium dark:text-white">{app.name}</div>
                      <div className="text-xs text-zinc-500">{app.developer}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 dark:text-zinc-400 text-sm">{app.category}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-sm dark:text-zinc-400">
                    {app.rating || "0"} <Star className="w-3 h-3 fill-current" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    app.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    app.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  )}>
                    {app.status?.toUpperCase() || "PENDING"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingApp(app)}
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {app.status !== "approved" && (
                      <button 
                        onClick={() => handleStatusUpdate(app.id, "approved")}
                        className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-600"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    {app.status !== "rejected" && (
                      <button 
                        onClick={() => handleStatusUpdate(app.id, "rejected")}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600"
                        title="Reject"
                      >
                        <LogOut className="w-4 h-4 rotate-180" />
                      </button>
                    )}
                    <button onClick={() => setDeletingAppId(app.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600" title="Delete"><Trash className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {editingApp && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-zinc-900 rounded-2xl p-8 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
              <h2 className="text-2xl font-bold mb-6 dark:text-white">Edit App</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">App Name</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.name} onChange={e => setEditingApp({ ...editingApp, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Developer</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.developer} onChange={e => setEditingApp({ ...editingApp, developer: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Category</label>
                  <select className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.category} onChange={e => setEditingApp({ ...editingApp, category: e.target.value })}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Description</label>
                  <textarea className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" rows={3} value={editingApp.description} onChange={e => setEditingApp({ ...editingApp, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Icon URL</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.icon} onChange={e => setEditingApp({ ...editingApp, icon: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Rating (0-5)</label>
                  <input type="number" step="0.1" min="0" max="5" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.rating} onChange={e => setEditingApp({ ...editingApp, rating: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Version</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.version} onChange={e => setEditingApp({ ...editingApp, version: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Downloads</label>
                  <input type="number" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={editingApp.downloads} onChange={e => setEditingApp({ ...editingApp, downloads: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={handleUpdateApp} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">Save Changes</button>
                <button onClick={() => setEditingApp(null)} className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 py-3 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-zinc-900 rounded-2xl p-8 w-full max-w-2xl shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 dark:text-white">Add New App</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">App Name</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.name} onChange={e => setNewApp({ ...newApp, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Developer</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.developer} onChange={e => setNewApp({ ...newApp, developer: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Category</label>
                  <select className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.category} onChange={e => setNewApp({ ...newApp, category: e.target.value })}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Description</label>
                  <textarea className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" rows={3} value={newApp.description} onChange={e => setNewApp({ ...newApp, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Icon URL</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.icon} onChange={e => setNewApp({ ...newApp, icon: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">Rating (0-5)</label>
                  <input type="number" step="0.1" min="0" max="5" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.rating} onChange={e => setNewApp({ ...newApp, rating: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-zinc-400">APK URL</label>
                  <input type="text" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 dark:text-white" value={newApp.apk_file} onChange={e => setNewApp({ ...newApp, apk_file: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsAdding(false)} className="px-6 py-2 rounded-lg font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                <button onClick={handleAddApp} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">Add App</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

const AdminCategories = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCat, setNewCat] = useState({ name: "", slug: "" });
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "categories"));
    return () => unsub();
  }, []);

  const handleAdd = async () => {
    if (!newCat.name) return;
    try {
      await addDoc(collection(db, "categories"), { ...newCat, slug: newCat.name.toLowerCase().replace(/ /g, "-") });
      setNewCat({ name: "", slug: "" });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "categories");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "categories", id));
      setDeletingCatId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
    }
  };

  return (
    <AdminLayout>
      <ConfirmationModal 
        isOpen={!!deletingCatId}
        onClose={() => setDeletingCatId(null)}
        onConfirm={() => deletingCatId && handleDelete(deletingCatId)}
        title="Delete Category"
        message="Are you sure you want to delete this category?"
      />
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-8 dark:text-white">Manage Categories</h1>
        <div className="flex gap-4 mb-8">
          <input
            type="text"
            placeholder="Category Name"
            className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 dark:text-white"
            value={newCat.name}
            onChange={e => setNewCat({ ...newCat, name: e.target.value })}
          />
          <button onClick={handleAdd} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">Add</button>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between px-6 py-4">
                <span className="font-medium dark:text-white">{cat.name}</span>
                <button onClick={() => setDeletingCatId(cat.id)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg"><Trash className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [confirmingBan, setConfirmingBan] = useState<{ id: string, isBanned: boolean } | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "users"));
  }, []);

  const toggleBan = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "users", id), { isBanned: !current });
      setConfirmingBan(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
    }
  };

  return (
    <AdminLayout>
      <ConfirmationModal 
        isOpen={!!confirmingBan}
        onClose={() => setConfirmingBan(null)}
        onConfirm={() => confirmingBan && toggleBan(confirmingBan.id, confirmingBan.isBanned)}
        title={confirmingBan?.isBanned ? "Unban User" : "Ban User"}
        message={`Are you sure you want to ${confirmingBan?.isBanned ? "unban" : "ban"} this user?`}
        variant={confirmingBan?.isBanned ? "success" : "danger"}
      />
      <div>
        <h1 className="text-3xl font-bold mb-8 dark:text-white">Manage Users</h1>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold dark:text-white">User</th>
                <th className="px-6 py-4 text-sm font-semibold dark:text-white">Role</th>
                <th className="px-6 py-4 text-sm font-semibold dark:text-white">Status</th>
                <th className="px-6 py-4 text-sm font-semibold dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <div className="font-medium dark:text-white">{user.name}</div>
                        <div className="text-xs text-zinc-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium", 
                      user.email === "jayydv107@gmail.com" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    )}>
                      {user.email === "jayydv107@gmail.com" ? "ADMIN" : "USER"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", user.isBanned ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                      {user.isBanned ? "Banned" : "Active"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => setConfirmingBan({ id: user.id, isBanned: user.isBanned })} className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:underline">
                      {user.isBanned ? "Unban" : "Ban"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

const AdminReviews = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [deletingReviewRef, setDeletingReviewRef] = useState<any>(null);

  useEffect(() => {
    const q = query(collectionGroup(db, "reviews"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => setReviews(s.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))), (err) => handleFirestoreError(err, OperationType.GET, "reviews"));
  }, []);

  const handleDelete = async (ref: any) => {
    try {
      await deleteDoc(ref);
      setDeletingReviewRef(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, ref.path);
    }
  };

  return (
    <AdminLayout>
      <ConfirmationModal 
        isOpen={!!deletingReviewRef}
        onClose={() => setDeletingReviewRef(null)}
        onConfirm={() => deletingReviewRef && handleDelete(deletingReviewRef)}
        title="Delete Review"
        message="Are you sure you want to delete this review? This action cannot be undone."
      />
      <h1 className="text-3xl font-bold mb-8 dark:text-white">Moderate Reviews</h1>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">User</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Review</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Rating</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Date</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {reviews.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  No reviews found.
                </td>
              </tr>
            ) : (
              reviews.map(review => (
                <tr key={review.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={review.userPhoto} className="w-8 h-8 rounded-full object-cover" />
                      <div className="text-sm font-medium dark:text-white">{review.userName}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md truncate">{review.comment}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm dark:text-white">{review.rating}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => setDeletingReviewRef(review.ref)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg">
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

const SupportPage = ({ user }: { user: User | null }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "support_tickets"), where("userId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(docs.sort((a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "support_tickets"));
  }, [user]);

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim()) return;
    setLoading(true);
    try {
      const ticketRef = await addDoc(collection(db, "support_tickets"), {
        userId: user.uid,
        userName: user.displayName || "User",
        userEmail: user.email,
        subject: subject.trim(),
        status: "open",
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
      });
      
      await addDoc(collection(db, "support_tickets", ticketRef.id, "messages"), {
        senderId: user.uid,
        senderName: user.displayName || "User",
        text: `New support request: ${subject}`,
        createdAt: new Date().toISOString(),
      });

      setSubject("");
      navigate(`/support/${ticketRef.id}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "support_tickets");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <Navigate to="/login" />;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <LifeBuoy className="w-8 h-8 text-green-600" />
          <h1 className="text-3xl font-bold dark:text-white">Support Center</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 dark:text-white">New Ticket</h2>
              <form onSubmit={createTicket} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="How can we help?"
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl p-3 dark:text-white"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Start Chat"}
                </button>
              </form>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold dark:text-white">Your Tickets</h2>
            {tickets.length === 0 ? (
              <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <MessageSquare className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <p className="text-zinc-500">No support tickets yet.</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/support/${ticket.id}`}
                  className="block bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-green-500 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium dark:text-white group-hover:text-green-600 transition-colors">{ticket.subject}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          ticket.status === "open" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : 
                          ticket.status === "replied" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                          "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {ticket.status.toUpperCase()}
                        </span>
                        <span>{new Date(ticket.lastMessageAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-green-600" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

const TicketDetails = ({ user, isAdmin }: { user: User | null, isAdmin: boolean }) => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticketId) return;
    const unsubTicket = onSnapshot(doc(db, "support_tickets", ticketId), (doc) => {
      if (doc.exists()) setTicket({ id: doc.id, ...doc.data() });
    }, (err) => handleFirestoreError(err, OperationType.GET, `support_tickets/${ticketId}`));

    const q = query(collection(db, "support_tickets", ticketId, "messages"), orderBy("createdAt", "asc"));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `support_tickets/${ticketId}/messages`));

    return () => { unsubTicket(); unsubMessages(); };
  }, [ticketId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || !ticketId) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "support_tickets", ticketId, "messages"), {
        senderId: user.uid,
        senderName: user.displayName || "User",
        text: newMessage.trim(),
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "support_tickets", ticketId), {
        lastMessageAt: new Date().toISOString(),
        status: isAdmin ? "replied" : "open",
      });
      setNewMessage("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "support_messages");
    } finally {
      setLoading(false);
    }
  };

  const closeTicket = async () => {
    if (!ticketId) return;
    setIsClosing(true);
    try {
      await updateDoc(doc(db, "support_tickets", ticketId), { status: "closed" });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "support_tickets");
    } finally {
      setIsClosing(false);
    }
  };

  if (!user) return <Navigate to="/login" />;
  if (!ticket) return <div className="p-8 text-center dark:text-white">Loading ticket...</div>;

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto p-4 md:p-6 h-[calc(100vh-120px)] flex flex-col">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-t-2xl border-x border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={isAdmin ? "/admin/support" : "/support"} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
              <ChevronRight className="w-5 h-5 rotate-180 dark:text-white" />
            </Link>
            <div>
              <h1 className="font-bold dark:text-white">{ticket.subject}</h1>
              <p className="text-xs text-zinc-500">Ticket ID: {ticket.id}</p>
            </div>
          </div>
          {ticket.status !== "closed" && (
            <button 
              onClick={() => setShowCloseModal(true)} 
              disabled={isClosing}
              className="text-sm font-medium text-red-600 hover:text-red-700 px-3 py-1 rounded-lg border border-red-200 hover:border-red-300 disabled:opacity-50"
            >
              {isClosing ? "Closing..." : "Close Ticket"}
            </button>
          )}
        </div>

        <ConfirmationModal 
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          onConfirm={closeTicket}
          title="Close Ticket"
          message="Are you sure you want to close this ticket? You won't be able to send more messages."
          confirmText="Close Ticket"
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-4 space-y-4 border-x border-zinc-200 dark:border-zinc-800">
          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex flex-col max-w-[80%]",
              msg.senderId === user?.uid ? "ml-auto items-end" : "mr-auto items-start"
            )}>
              <div className={cn(
                "p-3 rounded-2xl text-sm",
                msg.senderId === user?.uid 
                  ? "bg-green-600 text-white rounded-tr-none" 
                  : "bg-white dark:bg-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-tl-none shadow-sm"
              )}>
                {msg.text}
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">
                {msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-b-2xl border-x border-b border-zinc-200 dark:border-zinc-800">
          {ticket.status === "closed" ? (
            <div className="text-center py-2 text-zinc-500 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              This ticket is closed.
            </div>
          ) : (
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 dark:text-white outline-none focus:ring-2 focus:ring-green-600"
              />
              <button
                type="submit"
                disabled={loading || !newMessage.trim()}
                className="bg-green-600 text-white p-2 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

const AdminSupport = () => {
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "support_tickets"), orderBy("lastMessageAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "support_tickets"));
  }, []);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold dark:text-white">Support Tickets</h1>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            {tickets.filter(t => t.status === "open").length} Open
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            {tickets.filter(t => t.status === "replied").length} Replied
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="w-2 h-2 rounded-full bg-zinc-300" />
            {tickets.filter(t => t.status === "closed").length} Closed
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">User</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Subject</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Status</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Last Activity</th>
              <th className="px-6 py-4 text-sm font-semibold dark:text-white">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">No support tickets found.</td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium dark:text-white">{ticket.userName}</span>
                      <span className="text-xs text-zinc-500">{ticket.userEmail}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 dark:text-white">
                    <div className="flex items-center gap-2">
                      {ticket.subject}
                      {ticket.status === "open" && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      ticket.status === "open" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : 
                      ticket.status === "replied" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    )}>
                      {ticket.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500">
                    {new Date(ticket.lastMessageAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/admin/support/${ticket.id}`} className="text-green-600 hover:text-green-700 font-medium text-sm">
                      View Chat
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, "users", u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setIsAdmin(u.email === "jayydv107@gmail.com");
        } else {
          // Initialize user
          const isFirstUser = u.email === "jayydv107@gmail.com"; // Default admin
          await setDoc(userRef, {
            uid: u.uid,
            name: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            role: isFirstUser ? "admin" : "user",
            createdAt: new Date().toISOString()
          });
          setIsAdmin(isFirstUser);
          
          // Seed initial data if empty
          if (isFirstUser) {
            const appsSnap = await getDoc(doc(db, "apps", "sample-app-1"));
            if (!appsSnap.exists()) {
              const categories = [
                { name: "Games", slug: "games" },
                { name: "Education", slug: "education" },
                { name: "Tools", slug: "tools" },
                { name: "Social", slug: "social" }
              ];
              for (const cat of categories) {
                await addDoc(collection(db, "categories"), cat);
              }
              
              const sampleApps = [
                {
                  id: "whatsapp",
                  name: "WhatsApp",
                  description: "Simple. Personal. Secure. WhatsApp is a free messaging and video calling app used by over 2B people in more than 180 countries.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/whatsapp/200/200",
                  developer: "Meta",
                  apk_file: "https://example.com/whatsapp.apk",
                  rating: 4.8,
                  downloads: 5000000,
                  version: "2.24.5.76",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "instagram",
                  name: "Instagram",
                  description: "Bringing you closer to the people and things you love. Connect with friends, share what you're up to, or see what's new from others all over the world.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/instagram/200/200",
                  developer: "Meta",
                  apk_file: "https://example.com/instagram.apk",
                  rating: 4.7,
                  downloads: 1000000,
                  version: "321.0.0.33",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "facebook",
                  name: "Facebook",
                  description: "Connect with friends, family and people who share the same interests as you. Communicate privately, watch your favorite content, buy and sell items.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/facebook/200/200",
                  developer: "Meta",
                  apk_file: "https://example.com/facebook.apk",
                  rating: 4.1,
                  downloads: 5000000,
                  version: "453.0.0.44",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "tiktok",
                  name: "TikTok",
                  description: "TikTok is the destination for mobile videos. On TikTok, short-form videos are exciting, spontaneous, and genuine.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/tiktok/200/200",
                  developer: "ByteDance",
                  apk_file: "https://example.com/tiktok.apk",
                  rating: 4.4,
                  downloads: 1000000,
                  version: "33.8.4",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "youtube",
                  name: "YouTube",
                  description: "Get the official YouTube app on Android phones and tablets. See what the world is watching -- from the hottest music videos to what’s trending in gaming, fashion, beauty, news, learning and more.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/youtube/200/200",
                  developer: "Google LLC",
                  apk_file: "https://example.com/youtube.apk",
                  rating: 4.5,
                  downloads: 10000000,
                  version: "19.08.35",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "spotify",
                  name: "Spotify",
                  description: "With the Spotify music and podcast app, you can play millions of songs, albums and original podcasts for free.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/spotify/200/200",
                  developer: "Spotify AB",
                  apk_file: "https://example.com/spotify.apk",
                  rating: 4.6,
                  downloads: 1000000,
                  version: "8.9.18.612",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "netflix",
                  name: "Netflix",
                  description: "Netflix is the leading subscription service for watching TV episodes and movies on your favorite device.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/netflix/200/200",
                  developer: "Netflix, Inc.",
                  apk_file: "https://example.com/netflix.apk",
                  rating: 4.4,
                  downloads: 1000000,
                  version: "8.104.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "zoom",
                  name: "Zoom",
                  description: "Stay connected wherever you go – start or join a secure meeting with flawless video and audio, instant screen sharing, and cross-platform instant messaging.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/zoom/200/200",
                  developer: "zoom.us",
                  apk_file: "https://example.com/zoom.apk",
                  rating: 4.3,
                  downloads: 500000,
                  version: "5.17.10",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "snapchat",
                  name: "Snapchat",
                  description: "Snapchat is a fast and fun way to share the moment with your best friends and family.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/snapchat/200/200",
                  developer: "Snap Inc",
                  apk_file: "https://example.com/snapchat.apk",
                  rating: 4.2,
                  downloads: 1000000,
                  version: "12.74.0.35",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "telegram",
                  name: "Telegram",
                  description: "Pure instant messaging — simple, fast, secure, and synced across all your devices. One of the world's top 10 most downloaded apps with over 800 million active users.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/telegram/200/200",
                  developer: "Telegram FZ-LLC",
                  apk_file: "https://example.com/telegram.apk",
                  rating: 4.5,
                  downloads: 1000000,
                  version: "10.8.3",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "pinterest",
                  name: "Pinterest",
                  description: "Pinterest is the place to explore inspiration. You can: Discover new ideas, Save what inspires you, Shop to make them yours, and Share what you love.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/pinterest/200/200",
                  developer: "Pinterest",
                  apk_file: "https://example.com/pinterest.apk",
                  rating: 4.6,
                  downloads: 500000,
                  version: "12.9.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "linkedin",
                  name: "LinkedIn",
                  description: "LinkedIn is the world's largest professional network on the internet. You can use LinkedIn to find the right job or internship, connect and strengthen professional relationships.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/linkedin/200/200",
                  developer: "LinkedIn",
                  apk_file: "https://example.com/linkedin.apk",
                  rating: 4.3,
                  downloads: 1000000,
                  version: "4.1.916",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "twitter",
                  name: "X (Twitter)",
                  description: "The X app is the trusted digital town square for everyone. With X, you can: Post content for the world to see and join public conversations.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/twitter/200/200",
                  developer: "X Corp.",
                  apk_file: "https://example.com/twitter.apk",
                  rating: 4.0,
                  downloads: 1000000,
                  version: "10.30.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "discord",
                  name: "Discord",
                  description: "Discord is where you can make a home for your communities and friends. Where you can stay close and have fun over text, voice, and video.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/discord/200/200",
                  developer: "Discord Inc.",
                  apk_file: "https://example.com/discord.apk",
                  rating: 4.7,
                  downloads: 1000000,
                  version: "218.15",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "reddit",
                  name: "Reddit",
                  description: "Reddit is where people come together to have the most authentic and interesting conversations on the internet.",
                  category: "Social",
                  icon: "https://picsum.photos/seed/reddit/200/200",
                  developer: "redditinc",
                  apk_file: "https://example.com/reddit.apk",
                  rating: 4.4,
                  downloads: 100000,
                  version: "2024.08.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "uber",
                  name: "Uber",
                  description: "We’re committed to your safety at Uber. We’ve established a Door-to-Door Safety Standard to help you feel safe every time you ride.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/uber/200/200",
                  developer: "Uber Technologies, Inc.",
                  apk_file: "https://example.com/uber.apk",
                  rating: 4.6,
                  downloads: 500000,
                  version: "4.510.10002",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "airbnb",
                  name: "Airbnb",
                  description: "Find vacation rentals, cabins, beach houses, unique homes and experiences around the world - all made possible by hosts on Airbnb.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/airbnb/200/200",
                  developer: "Airbnb",
                  apk_file: "https://example.com/airbnb.apk",
                  rating: 4.8,
                  downloads: 100000,
                  version: "24.08",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "duolingo",
                  name: "Duolingo",
                  description: "Learn a new language with the world’s most-downloaded education app! Duolingo is the fun, free app for learning 35+ languages through quick, bite-sized lessons.",
                  category: "Education",
                  icon: "https://picsum.photos/seed/duolingo/200/200",
                  developer: "Duolingo",
                  apk_file: "https://example.com/duolingo.apk",
                  rating: 4.7,
                  downloads: 500000,
                  version: "5.141.2",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "canva",
                  name: "Canva",
                  description: "Canva is your free photo editor, logo maker, and video editor in one design app! Create stunning social media posts, cards, flyers, photo collages & more.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/canva/200/200",
                  developer: "Canva",
                  apk_file: "https://example.com/canva.apk",
                  rating: 4.8,
                  downloads: 1000000,
                  version: "2.254.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                },
                {
                  id: "capcut",
                  name: "CapCut",
                  description: "CapCut is a free all-in-one video editor and video maker app with everything you need to create stunning, high-quality videos.",
                  category: "Tools",
                  icon: "https://picsum.photos/seed/capcut/200/200",
                  developer: "Bytedance",
                  apk_file: "https://example.com/capcut.apk",
                  rating: 4.5,
                  downloads: 500000,
                  version: "11.2.0",
                  status: "approved",
                  createdAt: new Date().toISOString()
                }
              ];
              for (const app of sampleApps) {
                const { id, ...appData } = app;
                await setDoc(doc(db, "apps", id), appData);
              }
            }
          }
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors">
        <Navbar user={user} isAdmin={isAdmin} toggleDarkMode={() => setIsDarkMode(!isDarkMode)} isDarkMode={isDarkMode} />
        <AnimatePresence mode="wait">
          <Routes key={window.location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/app/:id" element={<AppDetailsPage user={user} />} />
            <Route path="/login" element={<LoginPage user={user} />} />
            <Route path="/signup" element={<LoginPage user={user} />} />
            <Route path="/profile" element={<ProfilePage user={user} isAdmin={isAdmin} />} />
            <Route path="/upload-app" element={<UploadAppPage user={user} />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/apps" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminApps />
              </ProtectedRoute>
            } />
            <Route path="/admin/categories" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminCategories />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminUsers />
              </ProtectedRoute>
            } />
            <Route path="/admin/reviews" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminReviews />
              </ProtectedRoute>
            } />
            <Route path="/admin/support" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <AdminSupport />
              </ProtectedRoute>
            } />
            <Route path="/admin/support/:ticketId" element={
              <ProtectedRoute user={user} isAdmin={isAdmin} adminOnly={true}>
                <TicketDetails user={user} isAdmin={isAdmin} />
              </ProtectedRoute>
            } />

            {/* Support Routes */}
            <Route path="/support" element={
              <ProtectedRoute user={user} isAdmin={isAdmin}>
                <SupportPage user={user} />
              </ProtectedRoute>
            } />
            <Route path="/support/:ticketId" element={
              <ProtectedRoute user={user} isAdmin={isAdmin}>
                <TicketDetails user={user} isAdmin={isAdmin} />
              </ProtectedRoute>
            } />
          </Routes>
        </AnimatePresence>
      </div>
    </Router>
  );
}
