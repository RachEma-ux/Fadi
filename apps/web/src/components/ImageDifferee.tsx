/**
 * Image à chargement différé, fondée sur unlazy (`@unlazy/react`, https://github.com/johannschopplich/unlazy) :
 * un espace réservé aux proportions de l'image s'affiche d'abord (ou un aperçu flou BlurHash / ThumbHash s'il est
 * fourni), l'image réelle n'est téléchargée qu'à l'approche de la zone visible, via les API natives du navigateur
 * (`loading="lazy"`), sans écouteur de défilement.
 *
 * L'attribut `data-image-chargee` passe à « oui » quand l'image réelle est affichée, à « erreur » si elle n'a pas pu
 * l'être — les recettes de bout en bout s'en servent pour ne pas confondre l'espace réservé avec l'image.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from "react";
import { UnLazyImage } from "@unlazy/react";
import { espaceReserveSvg } from "../lib/image-differee";

type ProprietesImage = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "loading" | "onLoad" | "onError">;

export interface ImageDiffereeProps extends ProprietesImage {
  /** Adresse de l'image réelle. */
  src: string;
  /** Jeu de sources de l'image réelle (optionnel). */
  srcSet?: string;
  /** Texte de remplacement : obligatoire, une image de Fadi est toujours décrite (ou `""` si décorative). */
  alt: string;
  /** Aperçu flou BlurHash, quand le serveur en fournit un. */
  blurhash?: string;
  /** Aperçu flou ThumbHash, quand le serveur en fournit un (prioritaire sur BlurHash). */
  thumbhash?: string;
  /** Charger tout de suite, même hors de la zone visible (image principale de la page). */
  immediate?: boolean;
  /** Appelée quand l'image réelle est affichée. */
  surChargement?: (image: HTMLImageElement) => void;
  /** Appelée quand l'image réelle n'a pas pu être chargée. */
  surErreur?: (image: HTMLImageElement) => void;
}

type Etat = "attente" | "oui" | "erreur";

export function ImageDifferee({ src, srcSet, alt, blurhash, thumbhash, immediate = false, surChargement, surErreur, width, height, ...reste }: ImageDiffereeProps) {
  const [etat, setEtat] = useState<Etat>("attente");
  useEffect(() => setEtat("attente"), [src]);
  // unlazy relance le chargement si ses rappels changent d'identité : on les stabilise par référence.
  const rappels = useRef({ surChargement, surErreur });
  rappels.current = { surChargement, surErreur };
  const onImageLoad = useCallback((img: HTMLImageElement) => {
    setEtat("oui");
    rappels.current.surChargement?.(img);
  }, []);
  const onImageError = useCallback((img: HTMLImageElement) => {
    setEtat("erreur");
    rappels.current.surErreur?.(img);
  }, []);
  const espaceReserve = useMemo(() => (blurhash || thumbhash ? undefined : espaceReserveSvg(Number(width), Number(height))), [blurhash, thumbhash, width, height]);
  return (
    <UnLazyImage
      {...reste}
      key={src}
      src={src}
      srcSet={srcSet}
      alt={alt}
      width={width}
      height={height}
      blurhash={blurhash}
      thumbhash={thumbhash}
      placeholderSrc={espaceReserve}
      preload={immediate}
      loading={immediate ? "eager" : "lazy"}
      decoding="async"
      onImageLoad={onImageLoad}
      onImageError={onImageError}
      data-image-chargee={etat}
    />
  );
}
