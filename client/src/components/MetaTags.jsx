import { Helmet } from 'react-helmet-async';

const MetaTags = ({ title, description, image, url, type = 'website', keywords = '', structuredData = null }) => {
  const appUrl = import.meta.env.VITE_APP_URL;
  const fullTitle = title ? `${title} | Torsongs` : 'Torsongs';
  
  // Replace localhost with production domain
  const productionUrl = url.replace('http://localhost:5173', appUrl);
  
  // Use default image if external image detected or no image provided
  const defaultImage = 'https://via.placeholder.com/1200x630/1a1a1a/ffffff?text=Torsongs';
  const cleanImage = (image && !image.includes('saavncdn') && !image.includes('jiosaavn')) ? image : defaultImage; // Filter out external CDN images

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={productionUrl} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={cleanImage} />
      <meta property="og:url" content={productionUrl} />
      <meta property="og:type" content={type} />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={cleanImage} />
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

export default MetaTags;
