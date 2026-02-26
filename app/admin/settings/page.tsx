import { getStatuses, getLabels, createStatus, createLabel, deleteLabel, getUsers, updateUserRole, deleteUser, saveWooCommerceSettings, saveEtsySettings, getSystemSettings } from "@/app/actions"

import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Trash2, Plus, ArrowLeft, Globe, Key, Lock, Save } from "lucide-react"
import Link from "next/link"
import { getColorClasses } from "@/lib/colors"
import { UserPermissionsForm } from "@/components/settings/user-permissions-form"
import { AddUserForm } from "@/components/settings/add-user-form"
import { WooDebugTool } from "@/components/settings/woo-debug-tool"
import { StatusList } from "@/components/settings/status-list"

import { WooSettingsForm } from "@/components/settings/woo-settings-form"
import { EtsyMultiStoreSettings } from "@/components/settings/etsy-multi-store-settings"
import { FaturaEntegraSettingsForm } from "@/components/settings/fatura-entegra-settings-form"
import { PrintMarktSettingsForm } from "@/components/settings/printmarkt-settings-form"
import { CronTrigger } from "@/components/settings/cron-trigger"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
    const session = await getSession()
    if (!session || session.user.role !== "admin") {
        redirect("/")
    }

    const statuses = await getStatuses()
    const labels = await getLabels()
    const users = await getUsers()
    const systemSettings = await getSystemSettings()

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/" className="p-2 hover:bg-white rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Ayarlar</h1>
                        <p className="text-sm md:text-base text-slate-500">Sistem yapılandırmasını yönetin.</p>
                    </div>
                </div>

                {/* WOOCOMMERCE INTEGRATION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <span className="bg-blue-600 text-white p-1 px-2 rounded text-sm">WC</span>
                        WooCommerce Entegrasyonu
                    </h2>
                    <p className="text-sm text-slate-600 mb-6">
                        Sitenizdeki siparişleri otomatik çekmek için API bilgilerini giriniz.
                        <br />
                        <span className="text-blue-600 font-medium">WooCommerce &gt; Ayarlar &gt; Gelişmiş &gt; REST API</span> yolunu izleyerek anahtar oluşturabilirsiniz.
                    </p>

                    <WooSettingsForm initialSettings={{
                        wc_url: systemSettings.wc_url,
                        wc_key: systemSettings.wc_key,
                        wc_secret: systemSettings.wc_secret
                    }} />
                </div>

                {/* PRINTMARKT INTEGRATION (Custom API) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <span className="bg-orange-600 text-white p-1 px-2 rounded text-sm">PM</span>
                        PrintMarkt (Özel API) Entegrasyonu
                    </h2>
                    <p className="text-sm text-slate-600 mb-6">
                        WooCommerce dışındaki (Özel Yazılım / Namecheap) sitenizden sipariş çekmek için API ayarlarınızı yapın.
                    </p>

                    <PrintMarktSettingsForm initialSettings={{
                        pm_url: systemSettings.pm_url,
                        pm_key: systemSettings.pm_key
                    }} />
                </div>

                {/* FATURA ENTEGRA INTEGRATION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <span className="bg-indigo-600 text-white p-1 px-2 rounded text-sm">FE</span>
                        FaturaEntegra Entegrasyonu
                    </h2>
                    <p className="text-sm text-slate-600 mb-6">
                        Faturaları otomatik kesmek ve kargo barkodu oluşturmak için API bilgilerinizi giriniz.
                    </p>

                    <FaturaEntegraSettingsForm initialSettings={{
                        fe_user: systemSettings.fe_user,
                        fe_pass: systemSettings.fe_pass,
                        fe_app_key: systemSettings.fe_app_key
                    }} />
                </div>


                {/* ETSY INTEGRATION (Multi-Store) */}
                {(() => {
                    // Migration Logic: Convert old flat keys to new array structure if needed
                    let etsyStores = []
                    try {
                        if (systemSettings.etsy_stores_json) {
                            etsyStores = JSON.parse(systemSettings.etsy_stores_json)
                        } else if (systemSettings.etsy_shop_id) {
                            // Fallback: Migrate old single store
                            etsyStores = [{
                                id: 'legacy-store',
                                name: 'Varsayılan Mağaza',
                                shopId: systemSettings.etsy_shop_id,
                                apiKey: systemSettings.etsy_api_key || '',
                                accessToken: systemSettings.etsy_access_token || null,
                                connected: !!systemSettings.etsy_access_token
                            }]
                        }
                    } catch (e) {
                        console.error("Etsy settings parse error", e)
                    }

                    return <EtsyMultiStoreSettings initialStores={etsyStores} initialGlobalKey={systemSettings.etsy_global_api_key || ''} />
                })()}


                {/* DEBUG TOOL */}
                <WooDebugTool />

                {/* USER MANAGEMENT SECTION (Full Width) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                                <span className="bg-orange-100 text-orange-700 p-1 px-2 rounded text-sm">3</span>
                                Personel & Yetki Yönetimi
                            </h2>
                            <p className="text-sm text-slate-600 mt-1">
                                Sisteme kayıt olan kullanıcıların yetkilerini buradan yönetebilirsiniz.
                                <br />
                                <span className="text-amber-700 font-bold">* "Pending" (Bekleyen)</span> kullanıcılar onaylanana kadar sisteme giremez.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4 items-end">
                            <AddUserForm />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="p-3 font-bold text-slate-900">Ad Soyad</th>
                                    <th className="p-3 font-bold text-slate-900">Kullanıcı Adı</th>
                                    <th className="p-3 font-bold text-slate-900">Kayıt Tarihi</th>
                                    <th className="p-3 font-bold text-slate-900">Yetki (Rol)</th>
                                    <th className="p-3 font-bold text-slate-900">Sütun Yetkileri</th>
                                    <th className="p-3 font-bold text-slate-900 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50 group">
                                        <td className="p-3 font-medium text-slate-900">{user.name}</td>
                                        <td className="p-3 text-slate-700 font-medium">{user.username}</td>
                                        <td className="p-3 text-slate-700">{new Date(user.createdAt).toLocaleDateString("tr-TR")}</td>
                                        <td className="p-3">
                                            <form action={async (formData) => {
                                                "use server"
                                                const newRole = formData.get("role") as string
                                                await updateUserRole(user.id, newRole)
                                            }}>
                                                <select
                                                    name="role"
                                                    defaultValue={user.role}
                                                    className={`p-1.5 rounded border text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-900 border-purple-200' :
                                                        user.role === 'staff' ? 'bg-blue-100 text-blue-900 border-blue-200' :
                                                            'bg-amber-100 text-amber-900 border-amber-200'
                                                        }`}
                                                >
                                                    <option value="pending" className="text-slate-900">Onay Bekliyor</option>
                                                    <option value="staff" className="text-slate-900">Personel</option>
                                                    <option value="admin" className="text-slate-900">Yönetici</option>
                                                </select>
                                                <button className="ml-2 text-xs bg-slate-900 text-white px-2 py-1.5 rounded hover:bg-black transition-colors opacity-100 font-medium">
                                                    Kaydet
                                                </button>
                                            </form>
                                        </td>
                                        <td className="p-3">
                                            {user.role !== 'admin' && (
                                                <UserPermissionsForm user={user} statuses={statuses} />
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            {user.username !== 'admin' && (
                                                <form action={async () => {
                                                    "use server"
                                                    await deleteUser(user.id)
                                                }}>
                                                    <button className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Kullanıcıyı Sil">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </form>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* STATUS MANAGEMENT */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                            <span className="bg-blue-100 text-blue-800 p-1 px-2 rounded text-sm font-bold">1</span>
                            Durum Kolonları
                        </h2>
                        <StatusList initialStatuses={statuses} />

                        <form action={createStatus} className="p-4 bg-slate-50 rounded-lg border border-dashed">
                            <h3 className="text-sm font-bold mb-3 text-slate-900">Yeni Kolon Ekle</h3>
                            <div className="space-y-3">
                                <input name="title" placeholder="Görünen Başlık (Örn: Paketlemede)" className="w-full text-sm p-2 border rounded text-slate-900 placeholder:text-slate-400 font-medium" required />
                                <input name="id" placeholder="Teknik Kod (Örn: packing)" className="w-full text-sm p-2 border rounded text-slate-900 placeholder:text-slate-400 font-medium" required />
                                <select name="color" className="w-full text-sm p-2 border rounded text-slate-900 font-medium">
                                    <option value="bg-slate-50">Gri</option>
                                    <option value="bg-blue-50">Mavi</option>
                                    <option value="bg-green-50">Yeşil</option>
                                    <option value="bg-yellow-50">Sarı</option>
                                    <option value="bg-red-50">Kırmızı</option>
                                    <option value="bg-purple-50">Mor</option>
                                </select>
                                <button className="w-full bg-black text-white p-2 rounded text-sm font-medium hover:bg-slate-800 flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Ekle
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* LABEL MANAGEMENT */}
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                                <span className="bg-purple-100 text-purple-800 p-1 px-2 rounded text-sm font-bold">2</span>
                                Sipariş Etiketleri
                            </h2>
                            {/* ... (labels content) ... */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                {labels.map((label) => {
                                    const colors = getColorClasses(label.color)
                                    return (
                                        <div key={label.id} className={`group flex items-center gap-2 px-3 py-1 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                            <span className="text-sm font-bold uppercase text-[10px]">{label.name}</span>
                                            <form action={async () => {
                                                "use server"
                                                await deleteLabel(label.id)
                                            }}>
                                                <button className="text-slate-400 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </form>
                                        </div>
                                    )
                                })}
                            </div>

                            <form action={createLabel} className="p-4 bg-slate-50 rounded-lg border border-dashed">
                                <h3 className="text-sm font-bold mb-3 text-slate-900">Yeni Etiket Ekle</h3>
                                <div className="space-y-3">
                                    <input name="name" placeholder="Etiket İsmi (Örn: VIP)" className="w-full text-sm p-2 border rounded text-slate-900 placeholder:text-slate-400 font-medium" required />
                                    <select name="color" className="w-full text-sm p-2 border rounded text-slate-900 font-medium">
                                        <option value="gray">Gri</option>
                                        <option value="blue">Mavi</option>
                                        <option value="green">Yeşil</option>
                                        <option value="red">Kırmızı</option>
                                        <option value="orange">Turuncu</option>
                                        <option value="purple">Mor</option>
                                        <option value="pink">Pembe</option>
                                        <option value="black">Siyah</option>
                                    </select>
                                    <button className="w-full bg-black text-white p-2 rounded text-sm font-medium hover:bg-slate-800 flex items-center justify-center gap-2">
                                        <Plus className="w-4 h-4" /> Ekle
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* CRON TRIGGER */}
                        <CronTrigger />
                    </div>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                        <span className="bg-purple-100 text-purple-800 p-1 px-2 rounded text-sm font-bold">2</span>
                        Sipariş Etiketleri
                    </h2>
                    <div className="flex flex-wrap gap-2 mb-6">
                        {labels.map((label) => {
                            const colors = getColorClasses(label.color)
                            return (
                                <div key={label.id} className={`group flex items-center gap-2 px-3 py-1 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                    <span className="text-sm font-bold uppercase text-[10px]">{label.name}</span>
                                    <form action={async () => {
                                        "use server"
                                        await deleteLabel(label.id)
                                    }}>
                                        <button className="text-slate-400 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </form>
                                </div>
                            )
                        })}
                    </div>

                    <form action={createLabel} className="p-4 bg-slate-50 rounded-lg border border-dashed">
                        <h3 className="text-sm font-bold mb-3 text-slate-900">Yeni Etiket Ekle</h3>
                        <div className="space-y-3">
                            <input name="name" placeholder="Etiket İsmi (Örn: VIP)" className="w-full text-sm p-2 border rounded text-slate-900 placeholder:text-slate-400 font-medium" required />
                            <select name="color" className="w-full text-sm p-2 border rounded text-slate-900 font-medium">
                                <option value="gray">Gri</option>
                                <option value="blue">Mavi</option>
                                <option value="green">Yeşil</option>
                                <option value="red">Kırmızı</option>
                                <option value="orange">Turuncu</option>
                                <option value="purple">Mor</option>
                                <option value="pink">Pembe</option>
                                <option value="black">Siyah</option>
                            </select>
                            <button className="w-full bg-black text-white p-2 rounded text-sm font-medium hover:bg-slate-800 flex items-center justify-center gap-2">
                                <Plus className="w-4 h-4" /> Ekle
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
