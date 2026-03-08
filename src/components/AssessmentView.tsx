import { useState, useEffect, FormEvent } from "react";
import { collection, query, where, getDocs, addDoc, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { ArrowLeft, Plus, Activity, LineChart as LineChartIcon, History, Scale, Ruler } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function AssessmentView({ clientId, clientName, onBack, isPersonal }: { clientId: string, clientName: string, onBack: () => void, isPersonal: boolean }) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscleMass, setMuscleMass] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [arms, setArms] = useState("");
  const [thighs, setThighs] = useState("");
  const [calves, setCalves] = useState("");

  useEffect(() => {
    fetchAssessments();
  }, [clientId]);

  const fetchAssessments = async () => {
    const q = query(
      collection(db, "assessments"), 
      where("client_id", "==", clientId)
    );
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    // Sort by date ascending for the chart
    data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setAssessments(data);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "assessments"), {
        client_id: clientId,
        date,
        weight: parseFloat(weight) || 0,
        height: parseFloat(height) || 0,
        bodyFat: parseFloat(bodyFat) || 0,
        muscleMass: parseFloat(muscleMass) || 0,
        chest: parseFloat(chest) || 0,
        waist: parseFloat(waist) || 0,
        hips: parseFloat(hips) || 0,
        arms: parseFloat(arms) || 0,
        thighs: parseFloat(thighs) || 0,
        calves: parseFloat(calves) || 0,
        createdAt: new Date().toISOString()
      });
      alert("Avaliação salva com sucesso!");
      setShowAddForm(false);
      fetchAssessments();
      
      // Reset form
      setWeight(""); setHeight(""); setBodyFat(""); setMuscleMass("");
      setChest(""); setWaist(""); setHips(""); setArms(""); setThighs(""); setCalves("");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar avaliação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const chartData = assessments.map(a => ({
    ...a,
    dateFormatted: new Date(a.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }));

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Avaliação Física</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Aluno: <span className="text-orange-600 dark:text-orange-500 font-medium">{clientName}</span></p>
          </div>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors text-sm font-medium shadow-lg shadow-orange-600/20"
          >
            <Plus className="w-4 h-4" />
            Nova Avaliação
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-600 dark:text-orange-500" />
              Preencher Nova Avaliação
            </h3>
            <button onClick={() => setShowAddForm(false)} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white text-sm">
              Cancelar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Data da Avaliação</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-4 border-b border-neutral-100 dark:border-white/5 pb-2 mt-2">
                <h4 className="text-sm font-bold text-orange-600 dark:text-orange-500 uppercase tracking-wider">Composição Corporal</h4>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Peso (kg)</label>
                <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} required
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Altura (cm)</label>
                <input type="number" step="1" value={height} onChange={(e) => setHeight(e.target.value)} required
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Gordura Corporal (%)</label>
                <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Massa Muscular (kg)</label>
                <input type="number" step="0.1" value={muscleMass} onChange={(e) => setMuscleMass(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>

              <div className="col-span-2 md:col-span-4 border-b border-neutral-100 dark:border-white/5 pb-2 mt-4">
                <h4 className="text-sm font-bold text-orange-600 dark:text-orange-500 uppercase tracking-wider">Medidas (cm)</h4>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Tórax</label>
                <input type="number" step="0.1" value={chest} onChange={(e) => setChest(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Cintura</label>
                <input type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Quadril</label>
                <input type="number" step="0.1" value={hips} onChange={(e) => setHips(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Braços</label>
                <input type="number" step="0.1" value={arms} onChange={(e) => setArms(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Coxas</label>
                <input type="number" step="0.1" value={thighs} onChange={(e) => setThighs(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Panturrilhas</label>
                <input type="number" step="0.1" value={calves} onChange={(e) => setCalves(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-orange-600/20"
            >
              {isSubmitting ? "Salvando..." : "Salvar Avaliação"}
            </button>
          </form>
        </div>
      )}

      {assessments.length > 0 && !showAddForm && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-6 flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-orange-600 dark:text-orange-500" />
              Evolução de Peso e Gordura
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="dateFormatted" stroke="#888" />
                  <YAxis yAxisId="left" stroke="#10b981" />
                  <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', borderColor: '#e5e5e5', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--tooltip-text, #000)' }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="weight" name="Peso (kg)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" type="monotone" dataKey="bodyFat" name="Gordura (%)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-neutral-100 dark:border-white/10">
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-orange-600 dark:text-orange-500" />
                Histórico de Avaliações
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-500 dark:text-neutral-400">
                <thead className="bg-neutral-50 dark:bg-neutral-800 text-xs uppercase text-neutral-500 border-b border-neutral-100 dark:border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Data</th>
                    <th className="px-6 py-4 font-medium">Peso</th>
                    <th className="px-6 py-4 font-medium">Gordura %</th>
                    <th className="px-6 py-4 font-medium">Massa Musc.</th>
                    <th className="px-6 py-4 font-medium">Cintura</th>
                    <th className="px-6 py-4 font-medium">Braço</th>
                    <th className="px-6 py-4 font-medium">Coxa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                  {[...assessments].reverse().map((a) => (
                    <tr key={a.id} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                        {new Date(a.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">{a.weight} kg</td>
                      <td className="px-6 py-4">{a.bodyFat}%</td>
                      <td className="px-6 py-4">{a.muscleMass} kg</td>
                      <td className="px-6 py-4">{a.waist} cm</td>
                      <td className="px-6 py-4">{a.arms} cm</td>
                      <td className="px-6 py-4">{a.thighs} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {assessments.length === 0 && !showAddForm && (
        <div className="bg-white dark:bg-neutral-900 p-12 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl text-center">
          <Scale className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-neutral-900 dark:text-white mb-2">Nenhuma avaliação encontrada</h3>
          <p className="text-neutral-500">Clique em "Nova Avaliação" para registrar a primeira.</p>
        </div>
      )}
    </div>
  );
}
