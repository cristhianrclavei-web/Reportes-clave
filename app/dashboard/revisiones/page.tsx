import { redirect } from 'next/navigation';

// La lista vive como subsección de Proyectos.
export default function RevisionesPage() {
  redirect('/dashboard/proyectos?sub=revisiones');
}
