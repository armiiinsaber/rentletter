// components/film/ProductFilmLazy.js
// The landing-page entry point for the film: code-split and client-only, so the film (and
// DeviceFrame + the scene library it pulls in) never joins the initial bundle. Drop this where
// the film should live:  <ProductFilmLazy />  — props/ref pass straight through to ProductFilm.
// Until it loads, a paper placeholder with the film's aspect holds the space (no layout shift).
import dynamic from 'next/dynamic';
import { C } from '../theme';

const ProductFilm = dynamic(() => import('./ProductFilm'), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ width: '100%', aspectRatio: '16 / 9', background: C.paperDeep, borderRadius: 12 }} />,
});
export default ProductFilm;
