import sqlite3
from typing import Dict, Tuple

def load_cache_from_db(db_path: str, show_disabled_photos: bool) -> Dict[Tuple[str, str], Tuple[float, float]]:
    """
    Load cache data from the database.

    Args:
        db_path (str): Path to the SQLite database.
        show_disabled_photos (bool): Whether to include disabled photos.

    Returns:
        Dict[Tuple[str, str], Tuple[float, float]]: A dictionary with keys as tuples of file paths
        and values as tuples of similarity and IQA scores.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    query = """
        SELECT filePath, simRefPath, similarity, IQA
        FROM present
    """
    if not show_disabled_photos:
        query += " WHERE isEnabled = 1"
    cursor.execute(query)
    cache_data = {(row[0], row[1]): (row[2], row[3]) for row in cursor.fetchall()}
    conn.close()
    return cache_data

def save_cache_to_db(db_path: str, cache_data: Dict[Tuple[str, str], Tuple[float, float]]) -> None:
    """
    Save cache data to the database.

    Args:
        db_path (str): Path to the SQLite database.
        cache_data (Dict[Tuple[str, str], Tuple[float, float]]): A dictionary with keys as tuples of file paths
        and values as tuples of similarity and IQA scores.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    for (file1, file2), (similarity, IQA) in cache_data.items():
        cursor.execute(
            """
            SELECT id FROM present WHERE filePath = ?
            """,
            (file1,),
        )
        result = cursor.fetchone()
        if result:
            cursor.execute(
                """
                UPDATE present
                SET simRefPath = ?, similarity = ?, IQA = ?
                WHERE id = ?
                """,
                (file2, similarity, IQA, result[0]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO present (fileName, fileUrl, filePath, info, date, groupId, simRefPath, similarity, IQA)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (file1, '', file1, '', '', 0, file2, similarity, IQA),
            )
    conn.commit()
    conn.close()

def update_group_id_in_db(db_path: str, file_path: str, group_id: int) -> None:
    """
    Update the group ID for a specific file in the database.

    Args:
        db_path (str): Path to the SQLite database.
        file_path (str): The file path for which the group ID needs to be updated.
        group_id (int): The new group ID to be set.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE present
        SET groupId = ?
        WHERE filePath = ?
        """,
        (group_id, file_path),
    )
    conn.commit()
    conn.close()
