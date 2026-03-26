import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faReceipt, faUtensils, faCar, faFilm, faBagShopping,
  faBolt, faHeartPulse, faTag,
} from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';

const CATEGORY_ICONS = {
  food:          faUtensils,
  transport:     faCar,
  entertainment: faFilm,
  shopping:      faBagShopping,
  bills:         faBolt,
  health:        faHeartPulse,
};

function iconFor(name) {
  return CATEGORY_ICONS[name.toLowerCase()] ?? faTag;
}

function formatDate(dateStr) {
  const datePart = dateStr.slice(0, 10);
  const d = new Date(datePart + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (datePart === today.toISOString().slice(0, 10)) return 'Today';
  if (datePart === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAmount(n) {
  return '$' + Number(n).toFixed(2);
}

export default function ExpenseList({ expenses, categories, onDelete, loading }) {
  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#6B7280';

  if (loading) return <div className="spinner" />;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Recent</span>
        {expenses.length > 0 && (
          <span className="badge">{expenses.length} transactions</span>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faReceipt} className="empty-icon" />
          <span className="empty-text">No expenses yet — add one above</span>
        </div>
      ) : (
        <div className="expense-list">
          {expenses.map(exp => {
            const color = colorFor(exp.category);
            return (
              <div key={exp.id} className="expense-item">
                <div
                  className="expense-cat-icon"
                  style={{
                    background: `${color}22`,
                    border: `1px solid ${color}44`,
                    color,
                  }}
                >
                  <FontAwesomeIcon icon={iconFor(exp.category)} />
                </div>
                <div className="expense-info">
                  <div className="expense-desc">
                    {exp.description || exp.category}
                  </div>
                  <div className="expense-meta">
                    {exp.description && (
                      <>
                        <span className="expense-cat">{exp.category}</span>
                        <span className="expense-dot">·</span>
                      </>
                    )}
                    <span className="expense-date">{formatDate(exp.date)}</span>
                  </div>
                </div>
                <div className="expense-right">
                  <span className="expense-amount">{formatAmount(exp.amount)}</span>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(exp.id)}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
