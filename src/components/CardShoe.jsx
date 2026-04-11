import styles from './CardShoe.module.css'

export default function CardShoe() {
  return (
    <div className={styles.shoe}>
      <div className={styles.card} />
      <div className={styles.card} />
      <div className={styles.card} />
    </div>
  )
}
